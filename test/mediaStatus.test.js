import assert from 'node:assert/strict';
import test from 'node:test';

import { mediaScenarios } from '../src/fixtures/mediaScenarios.js';
import { calculateOverallStatus, healthTimerStatus, inferVaultState, providerFailure } from '../src/lib/mediaStatus.js';

test('vault inference distinguishes unlocked, intentional lock, and inconsistency', () => {
    assert.equal(inferVaultState(mediaScenarios.unlockedHealthy).state, 'unlocked');
    assert.equal(inferVaultState(mediaScenarios.intentionalLock).state, 'locked');
    assert.equal(inferVaultState(mediaScenarios.unexpectedVaultLoss).state, 'inconsistent');
});

test('overall precedence is degraded, locked, attention, healthy', () => {
    const locked = inferVaultState(mediaScenarios.intentionalLock);
    assert.equal(calculateOverallStatus({ vault: locked, criticalFailures: [{ vaultDependent: false }], attention: [] }).label, 'Degraded');
    assert.equal(calculateOverallStatus({ vault: locked, criticalFailures: [], attention: [] }).label, 'Vault Locked');
    assert.equal(calculateOverallStatus({ vault: { state: 'unlocked' }, criticalFailures: [], attention: ['reminder'] }).label, 'Attention');
    assert.equal(calculateOverallStatus({ vault: { state: 'unlocked' }, criticalFailures: [], attention: [] }).label, 'Healthy');
});

test('provider and timer failure scenarios classify safely', () => {
    assert.equal(providerFailure(mediaScenarios.providerUnreachable.provider), true);
    assert.equal(providerFailure(mediaScenarios.providerAuthenticationFailure.provider), true);
    const now = Date.parse('2026-08-17T12:00:00Z');
    assert.equal(healthTimerStatus(mediaScenarios.healthTimerDisabled.timer, null, now).state, 'disabled');
    assert.equal(healthTimerStatus(mediaScenarios.healthTimerStale.timer, null, now).state, 'stale');
    assert.equal(healthTimerStatus(mediaScenarios.healthTimerFailed.timer, mediaScenarios.healthTimerFailed.service, now).state, 'failed');
    assert.equal(healthTimerStatus(mediaScenarios.healthTimerSuccessful.timer, mediaScenarios.healthTimerSuccessful.service, now).state, 'healthy');
});

test('the fixture catalog covers each operational condition', () => {
    assert.ok(Object.keys(mediaScenarios).length >= 20);
    assert.equal(mediaScenarios.activeWithoutFuse.service.state, 'active');
    assert.equal(mediaScenarios.quotaUnavailableCached.quota.free, 60);
});
