import { APP_CONFIG } from '../config/settings.js';
import { TtlCache } from '../lib/cache.js';
import { collectDns } from '../collectors/dns.js';
import { collectLogs } from '../collectors/logs.js';
import { collectMaintenance } from '../collectors/maintenance.js';
import { collectNetwork } from '../collectors/network.js';
import { collectProxy } from '../collectors/proxy.js';
import { collectServices } from '../collectors/services.js';
import { collectStorage } from '../collectors/storage.js';
import { collectOverviewBase } from '../collectors/system.js';

const cache = new TtlCache();

function mergeOverview(base, services, proxy, storage, dns, network, maintenance, logs) {
    const serviceMatrix = [
        ...services.systemd.map(service => ({
            name: service.name,
            label: service.label,
            kind: 'systemd',
            state: service.state,
            severity: service.severity,
        })),
        ...services.pm2.filter(app => app.critical).map(app => ({
            name: app.name,
            label: app.label,
            kind: 'pm2',
            state: app.state,
            severity: app.severity,
        })),
    ];

    const proxyRoutes = proxy.routes.map(route => ({
        id: route.id,
        label: route.label,
        host: route.host,
        publicPath: route.publicPath,
        severity: route.severity,
        latencyMs: route.probe?.latencyMs ?? null,
        target: route.target,
    }));

    const alerts = [
        ...base.alerts,
        ...storage.mounts.filter(mount => mount.severity === 'critical').map(mount => ({
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
        ...proxyRoutes.filter(route => route.severity !== 'healthy').map(route => ({
            id: `route-${route.id}`,
            level: route.severity === 'critical' ? 'critical' : 'warning',
            title: `${route.label} probe failed`,
            detail: `${route.host}${route.publicPath} is not healthy.`,
        })),
    ].filter((alert, index, all) => all.findIndex(item => item.id === alert.id) === index);

    return {
        generatedAt: Date.now(),
        summary: {
            ...base.summary,
            dnsHealthy: dns.ftlState === 'active' && dns.unboundState === 'active',
            proxyHealthy: proxyRoutes.every(route => route.severity === 'healthy'),
            vpnHealthy: network.interfaces.every(iface => iface.state === 'up'),
            queryRatePerMinute: dns.queryRatePerMinute,
            blockedPct: dns.blockedPct,
        },
        alerts,
        serviceMatrix,
        proxy: {
            degraded: proxyRoutes.filter(route => route.severity !== 'healthy').length,
            routes: proxyRoutes,
        },
        storage: {
            mounts: storage.mounts,
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
            interfaces: network.interfaces,
        },
        maintenance: {
            overdue: maintenance.timers.filter(timer => timer.state !== 'waiting').length,
            timers: maintenance.timers.slice(0, 4),
        },
        recentEvents: [
            ...(logs.events || []),
            ...(services.restartEvents || []),
        ].slice(0, 8),
        meta: {
            dataMode: APP_CONFIG.dataMode,
        },
    };
}

export async function getOverview(force = false) {
    if (force) cache.clear('overview');
    return cache.get('overview', APP_CONFIG.overviewTtlMs, async () => {
        const [base, services, proxy, storage, dns, network, maintenance, logs] = await Promise.all([
            collectOverviewBase(),
            getServices(),
            getProxy(),
            getStorage(),
            getDns(),
            getNetwork(),
            getMaintenance(),
            getLogsSummary(),
        ]);
        return mergeOverview(base, services, proxy, storage, dns, network, maintenance, logs);
    });
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
