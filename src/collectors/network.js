import fs from 'node:fs/promises';

import { NETWORK_INTERFACES } from '../config/topology.js';
import { withDataSource } from '../lib/dataSource.js';
import { runCommand } from '../lib/command.js';
import { normalizeInterfaceState } from '../lib/networkState.js';

const previousCounters = new Map();

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

async function collectInterfaces() {
    const result = await runCommand('ip', ['-j', 'address', 'show'], { timeout: 5000 });
    if (!result.ok || !result.stdout) return null;
    try {
        return JSON.parse(result.stdout).map(item => {
            const ipv4 = (item.addr_info || []).find(address => address.family === 'inet');
            return {
                iface: item.ifname,
                operstate: item.operstate,
                flags: item.flags || [],
                ip4: ipv4?.local || '',
                ip4subnet: ipv4?.prefixlen ?? null,
            };
        });
    } catch {
        return null;
    }
}

async function collectNetRates() {
    try {
        const now = Date.now();
        const lines = (await fs.readFile('/proc/net/dev', 'utf8')).split('\n').slice(2);
        const rates = new Map();
        for (const line of lines) {
            const [namePart, valuesPart] = line.split(':');
            if (!valuesPart) continue;
            const name = namePart.trim();
            const values = valuesPart.trim().split(/\s+/).map(Number);
            const current = { rx: values[0], tx: values[8], at: now };
            const previous = previousCounters.get(name);
            const elapsed = previous ? (now - previous.at) / 1000 : 0;
            rates.set(name, {
                rxMbps: elapsed > 0 ? Number(((current.rx - previous.rx) / elapsed / 1024 / 1024).toFixed(2)) : 0,
                txMbps: elapsed > 0 ? Number(((current.tx - previous.tx) / elapsed / 1024 / 1024).toFixed(2)) : 0,
            });
            previousCounters.set(name, current);
        }
        return rates;
    } catch { return new Map(); }
}

async function collectLiveNetwork() {
    try {
        const [netIfs, netRates, listeners, defaultRoute, dnsServers] = await Promise.all([
            collectInterfaces(),
            collectNetRates(),
            collectListeners(),
            collectDefaultRoute(),
            collectDnsServers(),
        ]);

        if (!netIfs) return null;
        const interfaces = NETWORK_INTERFACES.map(meta => {
            const iface = netIfs.find(item => item.iface === meta.name);
            const rates = netRates.get(meta.name) || {};
            const normalized = normalizeInterfaceState(meta, iface);
            return {
                name: meta.name,
                label: meta.label,
                state: normalized.state,
                address: iface?.ip4subnet ? `${iface.ip4}/${iface.ip4subnet}` : iface?.ip4 || '—',
                role: meta.role,
                rxMbps: rates.rxMbps ?? null,
                txMbps: rates.txMbps ?? null,
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
