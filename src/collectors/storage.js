import si from 'systeminformation';

import { CRITICAL_MOUNTS } from '../config/topology.js';
import { withDataSource } from '../lib/dataSource.js';
import { runCommand } from '../lib/command.js';
import { bytesToGiB, pickSeverity } from '../lib/format.js';

function normalizeMount(entry) {
    const meta = CRITICAL_MOUNTS.find(item => item.mount === entry.mount);
    return {
        mount: entry.mount,
        label: meta?.label || entry.mount,
        fsType: entry.fsType,
        source: entry.fs || 'unknown',
        usedPct: Number(entry.use.toFixed(1)),
        usedGiB: bytesToGiB(entry.used),
        totalGiB: bytesToGiB(entry.size),
        freeGiB: bytesToGiB(entry.size - entry.used),
        severity: pickSeverity(entry.use, meta?.warningPct ?? 80, meta?.criticalPct ?? 90),
    };
}

async function topConsumers(paths) {
    const result = await runCommand('du', ['-x', '-B1', '-d', '1', ...paths], { timeout: 20000 });
    if (!result.ok || !result.stdout) return [];
    return result.stdout.split('\n')
        .map(line => {
            const [bytes, path] = line.split('\t');
            return { path, usedGiB: bytesToGiB(Number(bytes)) };
        })
        .filter(item => item.path && !paths.includes(item.path))
        .sort((a, b) => b.usedGiB - a.usedGiB)
        .slice(0, 8);
}

async function collectLiveStorage() {
    try {
        const fsSize = await si.fsSize();
        const mounts = fsSize
            .filter(item => item.mount?.startsWith('/'))
            .map(normalizeMount)
            .sort((a, b) => b.usedPct - a.usedPct);
        return {
            generatedAt: Date.now(),
            mounts,
            securevault: mounts.find(item => item.mount === '/srv/secure')
                ? {
                    mapper: '/dev/mapper/securevault',
                    source: 'crypto_LUKS',
                    mount: '/srv/secure',
                    state: 'mounted',
                    notes: ['/media subpath', '/var/lib/jellyfin subpath'],
                }
                : {
                    mapper: '/dev/mapper/securevault',
                    source: 'crypto_LUKS',
                    mount: '/srv/secure',
                    state: 'missing',
                    notes: [],
                },
            topConsumers: await topConsumers(['/', '/srv/secure']),
        };
    } catch {
        return null;
    }
}

async function collectLiveStorageSummary() {
    try {
        const fsSize = await si.fsSize();
        const mounts = fsSize
            .filter(item => item.mount?.startsWith('/'))
            .map(normalizeMount)
            .sort((a, b) => b.usedPct - a.usedPct);
        return {
            generatedAt: Date.now(),
            mounts,
        };
    } catch {
        return null;
    }
}

export const collectStorage = withDataSource('storage', collectLiveStorage);
export const collectStorageSummary = withDataSource('storage', collectLiveStorageSummary);
