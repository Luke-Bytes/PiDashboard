import { MAINTENANCE_TIMERS } from '../config/topology.js';
import { withDataSource } from '../lib/dataSource.js';
import { runCommand } from '../lib/command.js';

async function collectLiveMaintenance() {
    const result = await runCommand('systemctl', ['list-timers', '--all', '--no-pager', '--no-legend']);
    if (!result.ok || !result.stdout) return null;

    const timers = result.stdout.split('\n').filter(Boolean).map(line => {
        const parts = line.trim().split(/\s{2,}/).filter(Boolean);
        const unitName = parts[4];
        const meta = MAINTENANCE_TIMERS.find(item => item.name === unitName);
        return {
            name: unitName,
            label: meta?.label || unitName,
            nextRun: parts[0] === 'n/a' ? null : parts[0],
            lastRun: parts[2] === 'n/a' ? null : parts[2],
            state: 'waiting',
        };
    }).filter(timer => timer.name);

    return { generatedAt: Date.now(), timers };
}

export const collectMaintenance = withDataSource('maintenance', collectLiveMaintenance);
