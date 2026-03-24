import fs from 'node:fs/promises';
import path from 'node:path';

import { APP_CONFIG } from '../config/settings.js';
import { PM2_APP_METADATA, POLICY_ACTION_DEFINITIONS, POLICY_INSPECT_REPORTS } from '../config/topology.js';
import { evidenceSnapshot } from '../fixtures/evidenceSnapshot.js';
import { TtlCache } from '../lib/cache.js';
import { runCommand } from '../lib/command.js';
import { shouldUseFixtureData } from '../config/settings.js';
import { getServices, clearAllCaches } from './dashboardService.js';

const cache = new TtlCache();

function findPolicyApp(services) {
    return services.pm2.find(app => app.name === 'policy') || null;
}

async function readPolicyLogs() {
    const files = ['policy-error.log', 'policy-out.log'];
    const events = [];

    for (const file of files) {
        try {
            const content = await fs.readFile(path.join(APP_CONFIG.logsDir, file), 'utf8');
            const lines = content.trim().split('\n').slice(-6).filter(Boolean);
            for (const line of lines) {
                events.push({
                    ts: Date.now(),
                    level: file.includes('error') ? 'warning' : 'info',
                    source: `pm2:${file}`,
                    message: line,
                });
            }
        } catch {}
    }

    return events.slice(-8).reverse();
}

async function collectLivePolicy() {
    const services = await getServices();
    const app = findPolicyApp(services);
    if (!app) return null;

    const meta = PM2_APP_METADATA.policy || {};
    const severity = app.state !== 'online' ? 'critical' : app.restarts > 3 ? 'warning' : 'healthy';

    return {
        generatedAt: Date.now(),
        runtime: {
            name: app.name,
            label: meta.label || app.name,
            state: app.state,
            severity,
            healthMode: meta.healthMode || 'process',
            uptimeSeconds: app.uptimeSeconds,
            restarts: app.restarts,
            memoryMiB: app.memoryMiB,
            cpuPct: app.cpuPct,
            port: app.port || meta.port || null,
            proxyHost: app.proxyHost || meta.proxyHost || null,
            cwd: app.cwd || meta.cwd || null,
            notes: meta.notes || [],
        },
        actions: POLICY_ACTION_DEFINITIONS.map(({ id, label, description, confirmation }) => ({
            id,
            label,
            description,
            confirmation,
            type: 'command',
        })),
        reports: POLICY_INSPECT_REPORTS.map(({ id, label, description }) => ({ id, label, description })),
        logs: await readPolicyLogs(),
    };
}

export async function getPolicy(force = false) {
    if (force) cache.clear('policy');
    if (shouldUseFixtureData()) return structuredClone(evidenceSnapshot.policy);
    return cache.get('policy', APP_CONFIG.standardTtlMs, async () => {
        const live = await collectLivePolicy();
        return live || structuredClone(evidenceSnapshot.policy);
    });
}

function briefTitle(report) {
    return `${report.label} (${new Date().toLocaleString()})`;
}

function buildStructuredBrief(report, result) {
    const commandText = [report.command, ...(report.args || [])].join(' ');
    const body = result.stdout || result.stderr || 'No output.';
    return [
        `# ${briefTitle(report)}`,
        '',
        '## Command',
        `- cwd: ${report.cwd || '.'}`,
        `- command: ${commandText}`,
        `- exit: ${result.code ?? 0}`,
        '',
        '## Output',
        '```text',
        body,
        '```',
    ].join('\n');
}

export async function runPolicyAction(id) {
    const action = POLICY_ACTION_DEFINITIONS.find(item => item.id === id);
    if (!action) return { ok: false, message: `Unknown policy action: ${id}` };

    const result = await runCommand(action.command, action.args, {
        cwd: action.cwd,
        timeout: action.timeout ?? 30000,
        maxBuffer: 1024 * 1024 * 4,
    });

    cache.clear();
    clearAllCaches();

    return {
        ok: result.ok,
        message: result.ok ? `${action.label} completed.` : `${action.label} failed.`,
        stdout: result.stdout,
        stderr: result.stderr,
        code: result.code ?? 0,
    };
}

export async function runPolicyInspectReport(id) {
    const report = POLICY_INSPECT_REPORTS.find(item => item.id === id);
    if (!report) return { ok: false, message: `Unknown policy report: ${id}` };

    if (shouldUseFixtureData()) {
        return {
            ok: true,
            reportId: id,
            label: report.label,
            command: [report.command, ...(report.args || [])].join(' '),
            generatedAt: Date.now(),
            structuredText: `# ${report.label}\n\nFixture-mode output for ${id}.`,
            rawText: `fixture:${id}`,
            exitCode: 0,
        };
    }

    const result = await runCommand(report.command, report.args, {
        cwd: report.cwd,
        timeout: report.timeout ?? 30000,
        maxBuffer: 1024 * 1024 * 4,
    });

    return {
        ok: result.ok,
        reportId: id,
        label: report.label,
        command: [report.command, ...(report.args || [])].join(' '),
        generatedAt: Date.now(),
        structuredText: buildStructuredBrief(report, result),
        rawText: [result.stdout, result.stderr].filter(Boolean).join('\n\n') || 'No output.',
        exitCode: result.code ?? 0,
    };
}
