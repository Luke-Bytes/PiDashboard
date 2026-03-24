import { ACTION_DEFINITIONS } from '../config/topology.js';
import { runCommand } from '../lib/command.js';
import { clearAllCaches, getProxy } from './dashboardService.js';

export function listActions() {
    return ACTION_DEFINITIONS.map(action => ({
        id: action.id,
        label: action.label,
        description: action.description,
        confirmation: action.confirmation,
        type: action.type,
    }));
}

export async function executeAction(id) {
    const action = ACTION_DEFINITIONS.find(item => item.id === id);
    if (!action) {
        return { ok: false, message: `Unknown action: ${id}` };
    }

    if (action.type === 'internal') {
        if (id === 'refresh-overview') {
            clearAllCaches();
            return { ok: true, message: 'Collector cache cleared.' };
        }
        if (id === 'probe-routes') {
            await getProxy(true);
            return { ok: true, message: 'Route probes refreshed.' };
        }
    }

    if (action.type === 'command') {
        const result = await runCommand(action.command, action.args, { timeout: 15000 });
        clearAllCaches();
        return {
            ok: result.ok,
            message: result.ok ? `${action.label} completed.` : `${action.label} failed.`,
            stdout: result.stdout,
            stderr: result.stderr,
            code: result.code ?? 0,
        };
    }

    return { ok: false, message: `Unhandled action type: ${action.type}` };
}
