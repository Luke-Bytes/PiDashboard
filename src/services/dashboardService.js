import { APP_CONFIG } from '../config/settings.js';
import { TtlCache } from '../lib/cache.js';
import { collectDns } from '../collectors/dns.js';
import { collectLogs } from '../collectors/logs.js';
import { collectMaintenance } from '../collectors/maintenance.js';
import { collectNetwork } from '../collectors/network.js';
import { collectProxy } from '../collectors/proxy.js';
import { collectServices } from '../collectors/services.js';
import { collectStorage, collectStorageSummary } from '../collectors/storage.js';
import { collectOverviewBase } from '../collectors/system.js';

const cache = new TtlCache();

function mergeOverviewCore(base, services, storage, dns, network) {
    const systemd = services.systemd || [];
    const pm2 = services.pm2 || [];
    const mounts = storage.mounts || [];
    const interfaces = network.interfaces || [];
    const serviceMatrix = [
        ...systemd.map(service => ({
            name: service.name,
            label: service.label,
            kind: 'systemd',
            state: service.state,
            severity: service.severity,
        })),
        ...pm2.filter(app => app.critical).map(app => ({
            name: app.name,
            label: app.label,
            kind: 'pm2',
            state: app.state,
            severity: app.severity,
        })),
    ];

    const alerts = [
        ...(base.alerts || []),
        ...[
            ['system', base], ['services', services], ['storage', storage], ['DNS', dns], ['network', network],
        ].filter(([, value]) => value?.available === false).map(([label]) => ({
            id: `collector-${label.toLowerCase()}`,
            level: 'critical',
            title: `${label} status unavailable`,
            detail: 'Live collection failed; fixture data was not substituted.',
        })),
        ...mounts.filter(mount => mount.severity === 'critical').map(mount => ({
            id: `mount-${mount.mount}`,
            level: 'critical',
            title: `${mount.label} is ${mount.usedPct}% full`,
            detail: `${mount.freeGiB} GiB free on ${mount.totalGiB} GiB.`,
        })),
        ...serviceMatrix.filter(service => service.severity === 'critical').map(service => ({
            id: `service-${service.name}`,
            level: 'critical',
            title: `${service.label} is ${service.state}`,
            detail: `${service.kind} service requires attention.`,
        })),
    ].filter((alert, index, all) => all.findIndex(item => item.id === alert.id) === index);

    return {
        generatedAt: Date.now(),
        summary: {
            ...base.summary,
            dnsHealthy: dns.ftlState === 'active' && dns.unboundState === 'active',
            proxyHealthy: null,
            vpnHealthy: interfaces.length > 0 && interfaces.every(iface => iface.state === 'up'),
            queryRatePerMinute: dns.queryRatePerMinute,
            blockedPct: dns.blockedPct,
        },
        alerts,
        serviceMatrix,
        proxy: null,
        storage: {
            mounts: mounts.slice(0, 3),
        },
        dns: {
            piholeEnabled: dns.piholeEnabled,
            ftlState: dns.ftlState,
            unboundState: dns.unboundState,
            blockedPct: dns.blockedPct,
            queryRatePerMinute: dns.queryRatePerMinute,
            latencyMs: dns.latencyMs,
            listeners: dns.listeners,
            severity: dns.ftlState === 'active' && dns.unboundState === 'active' ? 'healthy' : 'critical',
        },
        network: {
            interfaces,
        },
        maintenance: null,
        recentEvents: (services.restartEvents || []).slice(0, 5),
        meta: {
            dataMode: APP_CONFIG.dataMode,
            fastPath: true,
        },
    };
}

function mergeOverviewExtended(proxy, maintenance, logs) {
    const proxyRoutes = (proxy.routes || []).map(route => ({
        id: route.id,
        label: route.label,
        host: route.host,
        publicPath: route.publicPath,
        severity: route.severity,
        latencyMs: route.probe?.latencyMs ?? null,
        target: route.target,
        healthMode: route.healthMode || (route.probe ? 'http' : 'none'),
        notes: route.notes || '',
    }));

    return {
        generatedAt: Date.now(),
        summary: {
            proxyHealthy: proxy.available === false ? false : proxyRoutes.filter(route => route.healthMode === 'http').every(route => route.severity === 'healthy'),
        },
        proxy: {
            degraded: proxyRoutes.filter(route => route.healthMode === 'http' && route.severity !== 'healthy').length,
            routes: proxyRoutes,
        },
        maintenance: {
            overdue: (maintenance.timers || []).filter(timer => timer.state !== 'waiting').length,
            timers: (maintenance.timers || []).slice(0, 4),
        },
        recentEvents: (logs.events || []).slice(0, 8),
    };
}

export async function getOverviewCore(force = false) {
    if (force) cache.clear('overview:core');
    return cache.get('overview:core', APP_CONFIG.overviewTtlMs, async () => {
        const [base, services, storage, dns, network] = await Promise.all([
            collectOverviewBase(),
            getServices(),
            getStorageSummary(),
            getDns(),
            getNetwork(),
        ]);
        return mergeOverviewCore(base, services, storage, dns, network);
    });
}

export async function getOverviewExtended(force = false) {
    if (force) cache.clear('overview:extended');
    return cache.get('overview:extended', APP_CONFIG.standardTtlMs, async () => {
        const [proxy, maintenance, logs] = await Promise.all([
            getProxy(),
            getMaintenance(),
            getLogsSummary(),
        ]);
        return mergeOverviewExtended(proxy, maintenance, logs);
    });
}

export async function getOverview(force = false) {
    const [core, extended] = await Promise.all([
        getOverviewCore(force),
        getOverviewExtended(force),
    ]);
    return {
        ...core,
        summary: {
            ...core.summary,
            proxyHealthy: extended.summary.proxyHealthy,
        },
        proxy: extended.proxy,
        maintenance: extended.maintenance,
        recentEvents: [
            ...(core.recentEvents || []),
            ...(extended.recentEvents || []),
        ].slice(0, 8),
    };
}

export async function getServices(force = false) {
    if (force) cache.clear('services');
    return cache.get('services', APP_CONFIG.standardTtlMs, collectServices);
}

export async function getProxy(force = false) {
    if (force) cache.clear('proxy');
    return cache.get('proxy', APP_CONFIG.standardTtlMs, collectProxy);
}

export async function getStorage(force = false) {
    if (force) cache.clear('storage');
    return cache.get('storage', APP_CONFIG.expensiveTtlMs, collectStorage);
}

export async function getStorageSummary(force = false) {
    if (force) cache.clear('storage:summary');
    return cache.get('storage:summary', APP_CONFIG.standardTtlMs, collectStorageSummary);
}

export async function getNetwork(force = false) {
    if (force) cache.clear('network');
    return cache.get('network', APP_CONFIG.standardTtlMs, collectNetwork);
}

export async function getDns(force = false) {
    if (force) cache.clear('dns');
    return cache.get('dns', APP_CONFIG.standardTtlMs, collectDns);
}

export async function getMaintenance(force = false) {
    if (force) cache.clear('maintenance');
    return cache.get('maintenance', APP_CONFIG.maintenanceTtlMs, collectMaintenance);
}

export async function getLogsSummary(force = false) {
    if (force) cache.clear('logs');
    return cache.get('logs', APP_CONFIG.logsTtlMs, collectLogs);
}

export function clearAllCaches() {
    cache.clear();
}
