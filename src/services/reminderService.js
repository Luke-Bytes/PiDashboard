import fs from 'node:fs/promises';
import path from 'node:path';

import { APP_CONFIG } from '../config/settings.js';
import { isValidProviderId } from '../lib/cloudQuota.js';

export const REMINDER_SCHEMA_VERSION = 1;
export const DEFAULT_INTERVAL_MONTHS = 6;
const HISTORY_LIMIT = 12;

export function londonDate(timestamp = Date.now()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(new Date(timestamp));
    const pick = type => parts.find(part => part.type === type)?.value;
    return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

export function addCalendarMonths(dateString, months) {
    const [year, month, day] = dateString.split('-').map(Number);
    const targetIndex = year * 12 + month - 1 + months;
    const targetYear = Math.floor(targetIndex / 12);
    const targetMonth = targetIndex % 12;
    const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
    return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

export function reminderView(entry, now = Date.now()) {
    const history = Array.isArray(entry?.history) ? entry.history.slice(-HISTORY_LIMIT) : [];
    if (!entry?.confirmedDateLondon) return { state: 'missing', severity: 'warning', label: 'Login date not recorded', nextDueDate: null, lastConfirmedAt: null, history };
    const nextDueDate = addCalendarMonths(entry.confirmedDateLondon, entry.intervalMonths || DEFAULT_INTERVAL_MONTHS);
    const today = londonDate(now);
    const daysUntil = Math.round((Date.parse(`${nextDueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
    const details = { nextDueDate, daysUntil, lastConfirmedAt: entry.confirmedAtUtc || null, history };
    if (daysUntil < 0) return { state: 'overdue', severity: 'warning', label: `Overdue by ${Math.abs(daysUntil)} days`, ...details };
    if (daysUntil <= 30) return { state: 'approaching', severity: 'warning', label: `Due in ${daysUntil} days`, ...details };
    return { state: 'current', severity: 'healthy', label: `Due ${nextDueDate}`, ...details };
}

export function emptyReminderState() {
    return { version: REMINDER_SCHEMA_VERSION, providers: {} };
}

export function reconcileProviders(state, activeProviderIds) {
    const active = new Set(activeProviderIds.filter(isValidProviderId));
    const next = structuredClone(state?.version === REMINDER_SCHEMA_VERSION ? state : emptyReminderState());
    for (const provider of active) {
        next.providers[provider] ||= { intervalMonths: DEFAULT_INTERVAL_MONTHS, history: [], archived: false };
        next.providers[provider].archived = false;
    }
    for (const [provider, entry] of Object.entries(next.providers)) entry.archived = !active.has(provider);
    return next;
}

export async function readReminderState(filePath = APP_CONFIG.media.reminderStatePath) {
    try {
        const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
        return parsed?.version === REMINDER_SCHEMA_VERSION && parsed.providers && typeof parsed.providers === 'object' ? parsed : emptyReminderState();
    } catch (error) {
        if (error.code === 'ENOENT') return emptyReminderState();
        throw error;
    }
}

export async function writeJsonAtomic(filePath, value, mode = 0o600) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode });
    await fs.chmod(temporary, mode);
    await fs.rename(temporary, filePath);
}

export async function confirmProviderLogin(provider, options = {}) {
    if (!isValidProviderId(provider)) throw Object.assign(new Error('Invalid provider identifier'), { statusCode: 400 });
    const filePath = options.filePath || APP_CONFIG.media.reminderStatePath;
    const now = options.now ?? Date.now();
    const activeProviders = options.activeProviders || [];
    if (!activeProviders.includes(provider)) throw Object.assign(new Error('Provider is not active'), { statusCode: 404 });
    const state = reconcileProviders(await readReminderState(filePath), activeProviders);
    const entry = state.providers[provider];
    const date = londonDate(now);
    if (entry.confirmedDateLondon === date) return { changed: false, state };
    const timestamp = new Date(now).toISOString();
    entry.confirmedAtUtc = timestamp;
    entry.confirmedDateLondon = date;
    entry.history = [...(entry.history || []), timestamp].slice(-HISTORY_LIMIT);
    await writeJsonAtomic(filePath, state);
    return { changed: true, state };
}
