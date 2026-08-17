import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { addCalendarMonths, confirmProviderLogin, emptyReminderState, readReminderState, reconcileProviders, reminderView, writeJsonAtomic } from '../src/services/reminderService.js';

test('six calendar months clamps end of month', () => {
    assert.equal(addCalendarMonths('2025-08-31', 6), '2026-02-28');
    assert.equal(addCalendarMonths('2024-08-31', 6), '2025-02-28');
    assert.equal(addCalendarMonths('2026-01-31', 1), '2026-02-28');
});

test('reminders distinguish missing, approaching, and overdue', () => {
    assert.equal(reminderView(null).state, 'missing');
    assert.equal(reminderView({ confirmedDateLondon: '2026-02-28', intervalMonths: 6 }, Date.parse('2026-08-01T12:00:00Z')).state, 'approaching');
    assert.equal(reminderView({ confirmedDateLondon: '2026-01-31', intervalMonths: 6 }, Date.parse('2026-08-17T12:00:00Z')).state, 'overdue');
});

test('reconciliation adds new providers and archives removed providers', () => {
    const first = reconcileProviders(emptyReminderState(), ['ocean-a', 'ocean-b']);
    const next = reconcileProviders(first, ['ocean-b']);
    assert.equal(next.providers['ocean-a'].archived, true); assert.equal(next.providers['ocean-b'].archived, false);
});

test('atomic persistence and same-day confirmation are idempotent across reads', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-dashboard-reminders-'));
    const filePath = path.join(directory, 'state.json');
    await writeJsonAtomic(filePath, emptyReminderState());
    const now = Date.parse('2026-08-17T12:00:00Z');
    const first = await confirmProviderLogin('ocean-a', { filePath, activeProviders: ['ocean-a'], now });
    const second = await confirmProviderLogin('ocean-a', { filePath, activeProviders: ['ocean-a'], now: now + 3600000 });
    assert.equal(first.changed, true); assert.equal(second.changed, false);
    const persisted = await readReminderState(filePath);
    assert.equal(persisted.providers['ocean-a'].history.length, 1);
    assert.equal((await fs.stat(filePath)).mode & 0o777, 0o600);
});
