import fs from 'node:fs/promises';
import os from 'node:os';
import si from 'systeminformation';

import { APP_CONFIG, shouldUseFixtureData } from '../config/settings.js';
import { evidenceSnapshot } from '../fixtures/evidenceSnapshot.js';
import { aggregateQuotas, isValidProviderId, redactSecrets } from '../lib/cloudQuota.js';
import { runCommand } from '../lib/command.js';
import { calculateOverallStatus, createVaultStateTracker, deriveMediaSummary, healthTimerStatus, interpretMediaServices, providerFailure } from '../lib/mediaStatus.js';
import { readReminderState, reconcileProviders, reminderView, writeJsonAtomic } from '../services/reminderService.js';

const UNIT_META = [
    { name: 'jellyfin.service', label: 'Jellyfin', vaultDependent: true },
    { name: 'rclone-ocean.service', label: 'Ocean', vaultDependent: true },
    { name: 'rclone-jellyfin-pool.service', label: 'Jellyfin Pool', vaultDependent: true },
    { name: 'rclone-pool-health.timer', label: 'Weekly health', timer: true },
    { name: 'rclone-pool-health.service', label: 'Pool health check', check: true },
];

const vaultStateTracker = createVaultStateTracker(APP_CONFIG.media.transitionGraceMs);

function fieldsFromBlock(block) {
    return Object.fromEntries(block.split('\n').filter(Boolean).map(line => {
        const [key, ...rest] = line.split('=');
        return [key, rest.join('=')];
    }));
}

function timestamp(value) {
    if (!value || value === 'n/a') return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

async function collectUnits() {
    const result = await runCommand('systemctl', [
        'show', ...UNIT_META.map(unit => unit.name),
        '--property=Id,LoadState,ActiveState,SubState,Result,ExecMainCode,ExecMainStatus,NRestarts,MemoryCurrent,CPUUsageNSec,ActiveEnterTimestampMonotonic,ActiveEnterTimestamp,InactiveEnterTimestamp,LastTriggerUSec,NextElapseUSecRealtime',
    ], { timeout: 8000 });
    if (!result.stdout) return { available: false, units: [] };
    const units = result.stdout.split('\n\n').filter(Boolean).map(fieldsFromBlock).map(fields => {
        const meta = UNIT_META.find(item => item.name === fields.Id) || {};
        const enteredUs = Number(fields.ActiveEnterTimestampMonotonic || 0);
        const uptime = enteredUs ? Math.max(0, os.uptime() - enteredUs / 1e6) : null;
        return {
            name: fields.Id,
            label: meta.label || fields.Id,
            state: fields.LoadState === 'not-found' ? 'unavailable' : (fields.ActiveState || 'unknown'),
            subState: fields.SubState || 'unknown',
            result: fields.Result || null,
            execMainCode: fields.ExecMainCode || null,
            execMainStatus: Number.isFinite(Number(fields.ExecMainStatus)) ? Number(fields.ExecMainStatus) : null,
            activeEnterTimestamp: timestamp(fields.ActiveEnterTimestamp),
            inactiveEnterTimestamp: timestamp(fields.InactiveEnterTimestamp),
            restarts: Number(fields.NRestarts || 0),
            uptimeSeconds: uptime === null ? null : Math.round(uptime),
            memoryBytes: Number.isFinite(Number(fields.MemoryCurrent)) ? Number(fields.MemoryCurrent) : null,
            cpuSeconds: Number.isFinite(Number(fields.CPUUsageNSec)) ? Number(fields.CPUUsageNSec) / 1e9 : null,
            cpuPct: uptime > 0 && Number.isFinite(Number(fields.CPUUsageNSec)) ? Number((Number(fields.CPUUsageNSec) / 1e9 / uptime * 100).toFixed(1)) : null,
            lastTrigger: timestamp(fields.LastTriggerUSec),
            nextRun: timestamp(fields.NextElapseUSecRealtime),
            vaultDependent: Boolean(meta.vaultDependent),
            raw: { ...fields },
        };
    });
    return { available: true, units };
}

async function exists(target) {
    try { await fs.access(target); return true; } catch { return false; }
}

function unescapeMountPath(value) {
    return value.replace(/\\040/g, ' ').replace(/\\011/g, '\t').replace(/\\134/g, '\\');
}

async function readMounts() {
    try {
        const content = await fs.readFile('/proc/self/mountinfo', 'utf8');
        return content.trim().split('\n').map(line => {
            const parts = line.split(' ');
            const separator = parts.indexOf('-');
            return { mount: unescapeMountPath(parts[4]), fsType: parts[separator + 1] || 'unknown', source: parts[separator + 2] || 'unknown' };
        });
    } catch { return []; }
}

async function pathUsage(target, label, warningPct = 85, criticalPct = 90) {
    try {
        const stat = await fs.statfs(target);
        const total = Number(stat.blocks) * Number(stat.bsize);
        const free = Number(stat.bavail) * Number(stat.bsize);
        const used = total - free;
        const usedPct = total ? Number((used / total * 100).toFixed(1)) : 0;
        return { path: target, label, totalBytes: total, usedBytes: used, freeBytes: free, usedPct, severity: usedPct >= criticalPct ? 'critical' : usedPct >= warningPct ? 'warning' : 'healthy' };
    } catch { return { path: target, label, available: false, usedPct: null, severity: 'inactive' }; }
}

export function normalizeCloudCache(raw, now = Date.now(), staleMs = APP_CONFIG.media.healthStaleMs) {
    const registry = raw?.providerRegistry || raw?.lastKnownProviders || [];
    const registryIds = registry.map(item => typeof item === 'string' ? item : item?.id).filter(isValidProviderId);
    const sourceProviders = Array.isArray(raw?.providers) ? raw.providers : Object.entries(raw?.providers || {}).map(([id, value]) => ({ id, ...value }));
    const byId = new Map(sourceProviders.filter(item => isValidProviderId(item?.id || item?.provider)).map(item => [item.id || item.provider, item]));
    const ids = registryIds.length ? registryIds : [...byId.keys()];
    return ids.map(id => {
        const item = byId.get(id) || {};
        const quota = item.quota || (item.total !== undefined ? { total: item.total, used: item.used, free: item.free, trashed: item.trashed } : null);
        const normalizedQuota = quota && typeof quota === 'object' ? {
            total: Number.isFinite(quota.total) ? quota.total : null,
            used: Number.isFinite(quota.used) ? quota.used : null,
            free: Number.isFinite(quota.free) ? quota.free : null,
            trashed: Number.isFinite(quota.trashed) ? quota.trashed : null,
        } : null;
        const hasQuota = normalizedQuota && [normalizedQuota.total, normalizedQuota.used, normalizedQuota.free].some(Number.isFinite);
        const lastSuccessMs = Date.parse(item.lastSuccess || '');
        const quotaStale = item.reachability === 'failed' || !Number.isFinite(lastSuccessMs) || now - lastSuccessMs > staleMs;
        return {
            id,
            account: typeof item.account === 'string' && /^[^\s@]{1,64}@[^\s@]{1,189}$/.test(item.account) ? item.account : null,
            quota: hasQuota ? normalizedQuota : null,
            reachability: ['ok', 'failed', 'unknown'].includes(item.reachability) ? item.reachability : (item.lastSuccess ? 'ok' : 'unknown'),
            lastAttempt: item.lastAttempt || null,
            lastSuccess: item.lastSuccess || null,
            errorCategory: ['timeout', 'unreachable', 'authentication_failure', 'quota_unsupported'].includes(item.errorCategory) ? item.errorCategory : null,
            quotaState: hasQuota ? (quotaStale ? 'stale' : 'fresh') : 'not_collected',
            quotaStale: Boolean(hasQuota && quotaStale),
            quotaAgeMs: Number.isFinite(lastSuccessMs) ? Math.max(0, now - lastSuccessMs) : null,
        };
    });
}

export async function readCloudCache(filePath = APP_CONFIG.media.cloudCachePath, now = Date.now(), staleMs = APP_CONFIG.media.healthStaleMs) {
    try {
        const raw = JSON.parse(await fs.readFile(filePath, 'utf8'));
        if (!raw || typeof raw !== 'object' || !Array.isArray(raw.providerRegistry) || !raw.providers || typeof raw.providers !== 'object') throw new Error('invalid cache schema');
        const collectedMs = Date.parse(raw.generatedAt || '');
        if (!Number.isFinite(collectedMs)) throw new Error('invalid collection timestamp');
        const ageMs = Math.max(0, now - collectedMs);
        const state = ageMs > staleMs ? 'stale' : 'fresh';
        return {
            available: true,
            state,
            collectedAt: new Date(collectedMs).toISOString(),
            ageMs,
            freshness: state,
            providers: normalizeCloudCache(raw, now, staleMs),
            error: null,
        };
    } catch (error) {
        const notCollected = error.code === 'ENOENT';
        return {
            available: false,
            state: notCollected ? 'not_collected' : 'unreadable',
            collectedAt: null,
            ageMs: null,
            freshness: null,
            providers: [],
            error: notCollected
                ? 'Cloud quota collector is not installed or has not completed its first collection'
                : 'Cloud status cache is unreadable or invalid',
        };
    }
}

async function diagnostics() {
    const result = await runCommand('journalctl', ['--no-pager', '--output=cat', '--priority=err', '--lines=20', ...UNIT_META.filter(unit => !unit.timer).flatMap(unit => ['--unit', unit.name])], { timeout: 5000, maxBuffer: 32768 });
    if (!result.ok && !result.stdout) return [];
    return result.stdout.split('\n').filter(Boolean).slice(-20).map(line => redactSecrets(line));
}

export async function collectLiveMedia(options = {}) {
    const now = options.now ?? Date.now();
    const [unitResult, mounts, cloud, system, usage, reminderState, recentDiagnostics] = await Promise.all([
        collectUnits(), readMounts(), readCloudCache(APP_CONFIG.media.cloudCachePath, now),
        Promise.all([si.currentLoad(), si.mem(), si.cpuTemperature()]).catch(() => null),
        Promise.all([
            pathUsage('/', 'Root'), pathUsage(APP_CONFIG.media.vaultMount, 'Vault', 80, 90),
            pathUsage('/run', '/run', 70, 90), pathUsage(APP_CONFIG.media.transcodePath, 'Transcode cache', 80, 95),
        ]),
        readReminderState().catch(() => ({ version: 1, providers: {} })), diagnostics(),
    ]);
    const units = unitResult.units;
    const unit = name => units.find(item => item.name === name);
    const mount = target => mounts.find(item => item.mount === target);
    const rawMediaServices = UNIT_META.filter(item => item.vaultDependent).map(meta => unit(meta.name) || { ...meta, state: 'unavailable', subState: 'unknown', result: null, execMainStatus: null, raw: {} });
    const cloudMounts = [
        { target: APP_CONFIG.media.oceanMount, role: 'ocean' },
        { target: APP_CONFIG.media.poolMount, role: 'pool' },
    ].map(({ target, role }) => {
        const found = mount(target);
        return { path: target, role, present: Boolean(found), fuse: Boolean(found?.fsType?.startsWith('fuse')), fsType: found?.fsType || null, source: found?.source || null };
    });
    const mapperPresent = await exists(APP_CONFIG.media.vaultMapper);
    const markerPresent = await exists(APP_CONFIG.media.vaultMarker);
    const foundVaultMount = mount(APP_CONFIG.media.vaultMount);
    const requiredPaths = await Promise.all(APP_CONFIG.media.requiredPaths.map(async target => {
        const found = mount(target);
        return { path: target, present: Boolean(found), exists: await exists(target), fsType: found?.fsType || null, source: found?.source || null };
    }));
    const vault = (options.vaultStateTracker || vaultStateTracker).classify({
        mapper: mapperPresent,
        marker: markerPresent,
        vaultMount: { present: Boolean(foundVaultMount), source: foundVaultMount?.source || null, fsType: foundVaultMount?.fsType || null },
        expectedVaultSource: APP_CONFIG.media.vaultMapper,
        bindMounts: requiredPaths,
        cloudMounts,
        dependentServices: rawMediaServices,
    }, now);
    Object.assign(vault, {
        mapperPresent,
        markerPresent,
        mountPresent: Boolean(foundVaultMount),
        mountSource: foundVaultMount?.source || null,
        mountFsType: foundVaultMount?.fsType || null,
        mountSourceCorrect: foundVaultMount?.source === APP_CONFIG.media.vaultMapper,
        expectedMountSource: APP_CONFIG.media.vaultMapper,
        requiredPaths,
    });
    if (!vault.mountPresent) {
        const vaultUsage = usage.find(item => item.path === APP_CONFIG.media.vaultMount);
        if (vaultUsage) Object.assign(vaultUsage, { available: false, totalBytes: null, usedBytes: null, freeBytes: null, usedPct: null, severity: 'inactive' });
    }
    const topology = { ...vault, cloudMounts, requiredPaths };
    const mediaServices = interpretMediaServices(rawMediaServices, vault, topology);
    const mediaSummary = deriveMediaSummary(vault, mediaServices);
    const reconciled = reconcileProviders(reminderState, cloud.providers.map(provider => provider.id));
    if (cloud.available && JSON.stringify(reconciled) !== JSON.stringify(reminderState)) {
        await writeJsonAtomic(APP_CONFIG.media.reminderStatePath, reconciled).catch(() => {});
    }
    const providers = cloud.providers.map(provider => ({ ...provider, reminder: reminderView(reconciled.providers[provider.id], now) }));
    const timer = unit('rclone-pool-health.timer');
    const check = unit('rclone-pool-health.service');
    const health = { ...healthTimerStatus(timer, check, now, APP_CONFIG.media.healthStaleMs), timer, service: check };
    if (system?.[1]?.swaptotal) {
        const total = system[1].swaptotal;
        const used = system[1].swapused;
        const usedPct = Number((used / total * 100).toFixed(1));
        usage.push({ path: 'zram', label: 'zram', totalBytes: total, usedBytes: used, freeBytes: total - used, usedPct, severity: usedPct >= 95 ? 'critical' : usedPct >= 80 ? 'warning' : 'healthy' });
    }
    const criticalFailures = [];
    for (const service of mediaServices.filter(item => item.severity === 'critical')) criticalFailures.push({ id: service.name, vaultDependent: true });
    if (vault.state === 'inconsistent') criticalFailures.push({ id: 'vault-topology', vaultDependent: true });
    if (!unitResult.available) criticalFailures.push({ id: 'systemd-unavailable', vaultDependent: false });
    if (!system) criticalFailures.push({ id: 'system-metrics-unavailable', vaultDependent: false });
    if (health.severity === 'critical') criticalFailures.push({ id: 'pool-health', vaultDependent: false });
    for (const provider of providers.filter(providerFailure)) criticalFailures.push({ id: `provider-${provider.id}`, vaultDependent: false });
    for (const item of usage.filter(item => item.severity === 'critical')) criticalFailures.push({ id: `space-${item.path}`, vaultDependent: false });
    const attention = [
        ...providers.filter(provider => provider.reminder.severity === 'warning').map(provider => `reminder-${provider.id}`),
        ...providers.filter(provider => provider.errorCategory === 'quota_unsupported').map(provider => `quota-${provider.id}`),
        ...(health.severity === 'warning' ? ['pool-health'] : []),
        ...usage.filter(item => item.severity === 'warning').map(item => `space-${item.path}`),
        ...usage.filter(item => item.available === false && !(vault.intentionalLock && item.path === APP_CONFIG.media.vaultMount)).map(item => `capacity-${item.path}`),
        ...(!cloud.available || cloud.state === 'stale' ? ['cloud-cache'] : []),
        ...providers.filter(provider => provider.quotaStale).map(provider => `quota-stale-${provider.id}`),
        ...mediaServices.filter(item => item.severity === 'warning').map(item => `service-${item.name}`),
    ];
    return {
        generatedAt: now, available: true,
        overall: calculateOverallStatus({ vault, criticalFailures, attention }),
        vault, media: mediaSummary, cloudMounts, services: mediaServices, systemdAvailable: unitResult.available,
        system: system ? { uptimeSeconds: os.uptime(), cpuLoadPct: Number(system[0].currentLoad.toFixed(1)), memoryUsedBytes: system[1].active || system[1].used, memoryTotalBytes: system[1].total, zramUsedBytes: system[1].swapused, zramTotalBytes: system[1].swaptotal, temperatureC: system[2].main || null } : { available: false },
        capacity: usage, providers, cloudAvailable: cloud.available, cloudError: cloud.error || null,
        cloudCollection: {
            state: cloud.state,
            lastCollectedAt: cloud.collectedAt,
            freshness: cloud.freshness,
            ageMs: cloud.ageMs,
        },
        aggregates: aggregateQuotas(providers), health, diagnostics: recentDiagnostics,
        evidence: {
            systemd: rawMediaServices.map(service => ({ name: service.name, ...service.raw })),
            mounts: [
                { path: APP_CONFIG.media.vaultMount, present: Boolean(foundVaultMount), source: foundVaultMount?.source || null, fsType: foundVaultMount?.fsType || null },
                ...requiredPaths,
                ...cloudMounts,
            ],
            mapper: { path: APP_CONFIG.media.vaultMapper, present: mapperPresent },
            marker: { path: APP_CONFIG.media.vaultMarker, present: markerPresent },
        },
        reminderStateVersion: reconciled.version,
    };
}

export async function collectMedia(options = {}) {
    if (shouldUseFixtureData()) return structuredClone(evidenceSnapshot.media);
    try { return await collectLiveMedia(options); }
    catch { return { generatedAt: Date.now(), available: false, overall: { label: 'Degraded', severity: 'critical' }, error: 'Media health collection unavailable', providers: [], services: [], diagnostics: [] }; }
}
