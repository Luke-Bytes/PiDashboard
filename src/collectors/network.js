import si from 'systeminformation';

import { NETWORK_INTERFACES } from '../config/topology.js';
import { withDataSource } from '../lib/dataSource.js';
import { runCommand } from '../lib/command.js';
import { normalizeInterfaceState } from '../lib/networkState.js';

async function collectListeners() {
    const result = await runCommand('ss', ['-lntupH'], { timeout: 6000 });
    if (!result.ok || !result.stdout) return [];

    return result.stdout.split('\n').filter(Boolean).map(line => {
        const parts = line.trim().split(/\s+/);
        const [protocol, , , localAddress] = parts;
        const process = parts.slice(5).join(' ');
        const addressMatch = localAddress?.match(/(.*):(\d+)$/);
        const address = addressMatch ? addressMatch[1] : localAddress;
        const port = addressMatch ? Number(addressMatch[2]) : null;
        return {
            protocol: protocol?.replace('u', '') || 'tcp',
            address,
            port,
            process,
            exposure: address === '127.0.0.1' ? 'local' : 'network',
        };
    });
}

async function collectDefaultRoute() {
    const result = await runCommand('ip', ['route', 'show', 'default']);
    if (!result.ok || !result.stdout) return null;
    const match = result.stdout.match(/default via (\S+) dev (\S+)/);
    if (!match) return null;
    return { via: match[1], dev: match[2] };
}

async function collectDnsServers() {
    const result = await runCommand('sh', ['-c', "grep '^nameserver' /etc/resolv.conf | awk '{print $2}'"]);
    if (!result.ok || !result.stdout) return [];
    return result.stdout.split('\n').filter(Boolean);
}

async function collectLiveNetwork() {
    try {
        const [netIfs, netStats, listeners, defaultRoute, dnsServers] = await Promise.all([
            si.networkInterfaces(),
            si.networkStats(),
            collectListeners(),
            collectDefaultRoute(),
            collectDnsServers(),
        ]);

        const interfaces = NETWORK_INTERFACES.map(meta => {
            const iface = netIfs.find(item => item.iface === meta.name);
            const stats = netStats.find(item => item.iface === meta.name);
            const normalized = normalizeInterfaceState(meta, iface);
            return {
                name: meta.name,
                label: meta.label,
                state: normalized.state,
                address: iface?.ip4subnet ? `${iface.ip4}/${iface.ip4subnet}` : iface?.ip4 || '—',
                role: meta.role,
                rxMbps: Number(((stats?.rx_sec || 0) / 1024 / 1024).toFixed(2)),
                txMbps: Number(((stats?.tx_sec || 0) / 1024 / 1024).toFixed(2)),
                severity: normalized.severity,
            };
        });

        return {
            generatedAt: Date.now(),
            interfaces,
            listeners,
            defaultRoute,
            dnsServers,
            ufw: null,
        };
    } catch {
        return null;
    }
}

export const collectNetwork = withDataSource('network', collectLiveNetwork);
