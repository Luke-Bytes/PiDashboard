import { APP_CONFIG } from '../config/settings.js';
import { withDataSource } from '../lib/dataSource.js';
import { runCommand } from '../lib/command.js';
import { httpProbe } from '../lib/probes.js';

async function unitState(name) {
    const result = await runCommand('systemctl', ['is-active', name]);
    return result.ok ? result.stdout.trim() : 'unknown';
}

async function collectPiholeStats() {
    if (!APP_CONFIG.piholeApiUrl) return null;
    const response = await fetch(APP_CONFIG.piholeApiUrl, {
        headers: APP_CONFIG.piholeApiToken ? { Authorization: `Bearer ${APP_CONFIG.piholeApiToken}` } : {},
    });
    if (!response.ok) return null;
    return response.json();
}

async function collectLiveDns() {
    try {
        const [ftlState, unboundState, piholeStatus, unboundProbe] = await Promise.all([
            unitState('pihole-FTL'),
            unitState('unbound'),
            collectPiholeStats().catch(() => null),
            httpProbe('http://127.0.0.1').catch(() => null),
        ]);

        return {
            generatedAt: Date.now(),
            piholeEnabled: piholeStatus?.enabled ?? null,
            piholeVersion: piholeStatus?.versions ?? null,
            ftlState,
            unboundState,
            blockedPct: piholeStatus?.summary?.blockedPct ?? null,
            queryRatePerMinute: piholeStatus?.summary?.queriesPerMinute ?? null,
            queryTotal24h: piholeStatus?.summary?.queries24h ?? null,
            blockedTotal24h: piholeStatus?.summary?.blocked24h ?? null,
            latencyMs: unboundProbe?.latencyMs ?? null,
            listeners: ['53/tcp', '53/udp'],
            notes: [],
        };
    } catch {
        return null;
    }
}

export const collectDns = withDataSource('dns', collectLiveDns);
