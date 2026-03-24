import { MAINTENANCE_TIMERS } from '../config/topology.js';
import { withDataSource } from '../lib/dataSource.js';
import { runCommand } from '../lib/command.js';

function normalizeTimestamp(value) {
    if (!value || value === 'n/a' || value === '0') return null;
    return value;
}

async function collectLiveMaintenance() {
    const timerNames = MAINTENANCE_TIMERS.map(timer => timer.name);
    const result = await runCommand('systemctl', [
        'show',
        ...timerNames,
        '--property=Id,ActiveState,LastTriggerUSec,NextElapseUSecRealtime',
    ]);
    if (!result.ok || !result.stdout) return null;

    const timers = result.stdout
        .split('\n\n')
        .filter(Boolean)
        .map(block => {
            const fields = Object.fromEntries(block.split('\n').map(line => {
                const [key, ...rest] = line.split('=');
                return [key, rest.join('=')];
            }));
            const unitName = fields.Id;
            const meta = MAINTENANCE_TIMERS.find(item => item.name === unitName);
            return {
                name: unitName,
                label: meta?.label || unitName,
                nextRun: normalizeTimestamp(fields.NextElapseUSecRealtime),
                lastRun: normalizeTimestamp(fields.LastTriggerUSec),
                state: fields.ActiveState === 'active' ? 'waiting' : (fields.ActiveState || 'unknown'),
            };
        })
        .filter(timer => timer.name);

    return { generatedAt: Date.now(), timers };
}

export const collectMaintenance = withDataSource('maintenance', collectLiveMaintenance);
