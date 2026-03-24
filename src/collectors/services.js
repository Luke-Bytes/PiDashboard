import { CRITICAL_SYSTEMD_SERVICES, PM2_APP_METADATA } from '../config/topology.js';
import { withDataSource } from '../lib/dataSource.js';
import { runCommand } from '../lib/command.js';
import { bytesToMiB, normalizeStateSeverity } from '../lib/format.js';

async function collectSystemd() {
    const result = await runCommand('systemctl', ['show', ...CRITICAL_SYSTEMD_SERVICES.map(item => item.name), '--property=Id,ActiveState,SubState,ActiveEnterTimestampMonotonic']);
    if (!result.ok || !result.stdout) return null;

    const blocks = result.stdout.split('\n\n').filter(Boolean);
    return blocks.map(block => {
        const fields = Object.fromEntries(block.split('\n').map(line => {
            const [key, ...rest] = line.split('=');
            return [key, rest.join('=')];
        }));
        const meta = CRITICAL_SYSTEMD_SERVICES.find(item => item.name === fields.Id);
        return {
            name: fields.Id,
            label: meta?.label || fields.Id,
            state: fields.ActiveState || 'unknown',
            subState: fields.SubState || 'unknown',
            uptimeSeconds: null,
            critical: Boolean(meta?.critical),
            category: meta?.category || 'system',
            severity: normalizeStateSeverity(fields.ActiveState, meta?.critical),
        };
    });
}

async function collectPm2() {
    const result = await runCommand('pm2', ['jlist'], { timeout: 8000 });
    if (!result.ok || !result.stdout) return null;

    const list = JSON.parse(result.stdout);
    return list.map(app => {
        const meta = PM2_APP_METADATA[app.name] || {};
        const state = app.pm2_env?.status || 'unknown';
        const restartCount = app.pm2_env?.restart_time ?? 0;
        return {
            name: app.name,
            label: meta.label || app.name,
            state,
            restarts: restartCount,
            uptimeSeconds: app.pm2_env?.pm_uptime ? Math.max(0, Math.round((Date.now() - app.pm2_env.pm_uptime) / 1000)) : 0,
            memoryMiB: bytesToMiB(app.monit?.memory || 0),
            cpuPct: Number((app.monit?.cpu || 0).toFixed(1)),
            port: meta.port || null,
            ports: meta.ports || [],
            proxyPath: meta.proxyPath || null,
            proxyHost: meta.proxyHost || null,
            cwd: app.pm2_env?.pm_cwd || meta.cwd || null,
            critical: Boolean(meta.critical),
            severity: state === 'online' && restartCount < 5 ? 'healthy' : normalizeStateSeverity(state, meta.critical),
        };
    });
}

async function collectLiveServices() {
    const [systemd, pm2] = await Promise.all([collectSystemd(), collectPm2()]);
    if (!systemd && !pm2) return null;

    return {
        generatedAt: Date.now(),
        systemd: systemd || [],
        pm2: pm2 || [],
        restartEvents: (pm2 || [])
            .filter(app => app.restarts > 0)
            .map(app => ({
                ts: Date.now(),
                source: `pm2:${app.name}`,
                level: app.restarts > 5 ? 'critical' : 'warning',
                message: `${app.name} has restarted ${app.restarts} times.`,
            })),
    };
}

export const collectServices = withDataSource('services', collectLiveServices);
