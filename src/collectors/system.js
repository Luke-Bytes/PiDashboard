import os from 'node:os';
import si from 'systeminformation';

import { APP_CONFIG } from '../config/settings.js';
import { CRITICAL_MOUNTS, NETWORK_INTERFACES, PROXY_ROUTES } from '../config/topology.js';
import { withDataSource } from '../lib/dataSource.js';
import { bytesToGiB, pickSeverity } from '../lib/format.js';

function normalizeMount(fsEntry) {
    const usedGiB = bytesToGiB(fsEntry.used);
    const totalGiB = bytesToGiB(fsEntry.size);
    const freeGiB = Number((totalGiB - usedGiB).toFixed(1));
    const config = CRITICAL_MOUNTS.find(item => item.mount === fsEntry.mount);
    return {
        mount: fsEntry.mount,
        label: config?.label || fsEntry.mount,
        fsType: fsEntry.fsType,
        source: fsEntry.fs || fsEntry.source || 'unknown',
        usedPct: Number(fsEntry.use.toFixed(1)),
        usedGiB,
        totalGiB,
        freeGiB,
        severity: pickSeverity(fsEntry.use, config?.warningPct ?? 80, config?.criticalPct ?? 90),
    };
}

async function collectLiveOverview() {
    try {
        const [load, mem, temp, cpu, fsSize, netIfs, netStats] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.cpuTemperature(),
            si.cpu(),
            si.fsSize(),
            si.networkInterfaces(),
            si.networkStats(),
        ]);

        const mounts = fsSize
            .filter(item => item.mount?.startsWith('/'))
            .map(normalizeMount)
            .sort((a, b) => b.usedPct - a.usedPct);

        const rootMount = mounts.find(item => item.mount === '/');
        const secureMount = mounts.find(item => item.mount === '/srv/secure');
        const interfaces = NETWORK_INTERFACES.map(meta => {
            const iface = netIfs.find(item => item.iface === meta.name);
            const stats = netStats.find(item => item.iface === meta.name);
            return {
                name: meta.name,
                label: meta.label,
                state: iface?.operstate || 'down',
                address: iface?.ip4subnet ? `${iface.ip4}/${iface.ip4subnet}` : iface?.ip4 || '—',
                role: meta.role,
                rxMbps: Number(((stats?.rx_sec || 0) / 1024 / 1024).toFixed(2)),
                txMbps: Number(((stats?.tx_sec || 0) / 1024 / 1024).toFixed(2)),
                severity: iface?.operstate === 'up' ? 'healthy' : 'warning',
            };
        });

        const alerts = [];
        if (rootMount?.usedPct >= 90) {
            alerts.push({
                id: 'root-disk-pressure',
                level: 'critical',
                title: `Root filesystem is ${rootMount.usedPct}% full`,
                detail: `${rootMount.source} has ${rootMount.freeGiB} GiB free on ${rootMount.totalGiB} GiB.`,
            });
        }

        return {
            generatedAt: Date.now(),
            summary: {
                hostname: os.hostname(),
                platform: `${os.type()} ${os.release()}`,
                kernel: os.release(),
                uptimeSeconds: os.uptime(),
                cpuModel: cpu.brand,
                cpuLoadPct: Number(load.currentLoad.toFixed(1)),
                cpuCores: cpu.physicalCores || cpu.cores || null,
                memoryUsedGiB: bytesToGiB(mem.active || mem.used),
                memoryTotalGiB: bytesToGiB(mem.total),
                zramSwapGiB: bytesToGiB(mem.swaptotal || 0),
                zramSwapUsedGiB: bytesToGiB(mem.swapused || 0),
                temperatureC: temp.main || null,
                throttledHex: null,
                cpuClockMHz: null,
                rootUsedPct: rootMount?.usedPct ?? null,
                rootFreeGiB: rootMount?.freeGiB ?? null,
                secureUsedPct: secureMount?.usedPct ?? null,
                dnsHealthy: null,
                proxyHealthy: null,
                vpnHealthy: interfaces.every(item => item.state === 'up'),
            },
            alerts,
            serviceMatrix: [],
            proxy: { degraded: 0, routes: [] },
            storage: { mounts },
            dns: {
                piholeEnabled: null,
                ftlState: 'unknown',
                unboundState: 'unknown',
                blockedPct: null,
                queryRatePerMinute: null,
                latencyMs: null,
                listeners: [],
                severity: 'warning',
            },
            network: { interfaces },
            maintenance: { overdue: 0, timers: [] },
            recentEvents: [],
            meta: { dataMode: APP_CONFIG.dataMode },
        };
    } catch {
        return null;
    }
}

export const collectOverviewBase = withDataSource('overviewCore', collectLiveOverview);
