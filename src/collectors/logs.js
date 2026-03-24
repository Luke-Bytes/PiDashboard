import fs from 'node:fs/promises';
import path from 'node:path';

import { APP_CONFIG } from '../config/settings.js';
import { withDataSource } from '../lib/dataSource.js';
import { runCommand } from '../lib/command.js';

async function collectJournal() {
    const result = await runCommand('journalctl', ['-p', 'warning', '-n', '20', '--no-pager', '-o', 'short-iso'], { timeout: 8000 });
    if (!result.ok || !result.stdout) return [];
    return result.stdout.split('\n').filter(Boolean).map(line => ({
        ts: Date.now(),
        source: 'journal',
        level: 'warning',
        message: line,
    }));
}

async function collectPm2LogSnippets() {
    try {
        const files = await fs.readdir(APP_CONFIG.logsDir);
        const targets = files.filter(file => file.endsWith('-error.log') || file.endsWith('-out.log')).slice(0, 4);
        const snippets = await Promise.all(targets.map(async file => {
            const fullPath = path.join(APP_CONFIG.logsDir, file);
            const content = await fs.readFile(fullPath, 'utf8');
            const lastLine = content.trim().split('\n').slice(-1)[0];
            return lastLine ? {
                ts: Date.now(),
                source: `pm2:${file}`,
                level: file.endsWith('-error.log') ? 'warning' : 'info',
                message: lastLine,
            } : null;
        }));
        return snippets.filter(Boolean);
    } catch {
        return [];
    }
}

async function collectLiveLogs() {
    try {
        const [journalEvents, pm2Events] = await Promise.all([collectJournal(), collectPm2LogSnippets()]);
        return {
            generatedAt: Date.now(),
            events: [...journalEvents, ...pm2Events].slice(0, 20),
            sources: ['journal', 'pm2'],
        };
    } catch {
        return null;
    }
}

export const collectLogs = withDataSource('logs', collectLiveLogs);
