import assert from 'node:assert/strict';
import test from 'node:test';

import { mediaScenarios } from '../src/fixtures/mediaScenarios.js';
import { calculateOverallStatus, createVaultStateTracker, deriveMediaSummary, healthTimerStatus, inferVaultState, interpretMediaServices, providerFailure } from '../src/lib/mediaStatus.js';

const active = (name, extra = {}) => ({ name, state: 'active', subState: 'running', result: 'success', execMainStatus: 0, ...extra });
const stopped = (name, extra = {}) => ({ name, state: 'inactive', subState: 'dead', result: 'success', execMainStatus: 0, ...extra });

function openTopology(services = [active('jellyfin.service'), active('rclone-ocean.service'), active('rclone-jellyfin-pool.service')]) {
    return {
        mapper: true,
        marker: true,
        vaultMount: { present: true, source: '/dev/mapper/securevault', fsType: 'ext4' },
        bindMounts: [{ path: '/media', present: true }, { path: '/var/lib/jellyfin', present: true }],
        cloudMounts: [
            { path: '/mnt/jellyfin-cloud/ocean-source', role: 'ocean', present: true, fuse: true },
            { path: '/srv/secure/cloud/pool', role: 'pool', present: true, fuse: true },
        ],
        dependentServices: services,
    };
}

function closedTopology(services = [stopped('jellyfin.service'), stopped('rclone-ocean.service'), stopped('rclone-jellyfin-pool.service')]) {
    return {
        mapper: false,
        marker: false,
        vaultMount: { present: false, source: null },
        bindMounts: [{ path: '/media', present: false }, { path: '/var/lib/jellyfin', present: false }],
        cloudMounts: [
            { path: '/mnt/jellyfin-cloud/ocean-source', role: 'ocean', present: false, fuse: false },
            { path: '/srv/secure/cloud/pool', role: 'pool', present: false, fuse: false },
        ],
        dependentServices: services,
    };
}

function interpreted(topology, vault) {
    return interpretMediaServices(topology.dependentServices, vault, {
        mapperPresent: topology.mapper,
        markerPresent: topology.marker,
        mountPresent: topology.vaultMount.present,
        mountSourceCorrect: topology.vaultMount.source === '/dev/mapper/securevault',
        requiredPaths: topology.bindMounts,
        cloudMounts: topology.cloudMounts,
    });
}

test('physical topology classifies fully open and fully closed states immediately', () => {
    assert.equal(inferVaultState(openTopology()).state, 'open');
    assert.equal(inferVaultState(closedTopology()).state, 'closed');
    assert.equal(inferVaultState({ ...openTopology(), marker: false }).state, 'inconsistent');
    assert.equal(inferVaultState({ ...openTopology(), bindMounts: [{ present: false }] }).state, 'inconsistent');
    assert.equal(inferVaultState({ ...closedTopology(), mapper: true }).state, 'inconsistent');
    assert.equal(inferVaultState({ ...openTopology(), vaultMount: { present: true, source: '/dev/sda1' } }).state, 'inconsistent');
});

test('transition tracking follows stable direction, completes, and expires after 60 seconds', () => {
    const tracker = createVaultStateTracker(60000);
    assert.equal(tracker.classify(closedTopology(), 1000).state, 'closed');
    const partialOpening = { ...closedTopology(), mapper: true };
    assert.equal(tracker.classify(partialOpening, 2000).state, 'opening');
    assert.equal(tracker.classify(partialOpening, 62001).state, 'inconsistent');
    assert.equal(tracker.classify(openTopology(), 63000).state, 'open');
    const partialClosing = { ...openTopology(), cloudMounts: openTopology().cloudMounts.map(item => ({ ...item, present: false, fuse: false })), dependentServices: openTopology().dependentServices.map(service => ({ ...service, state: 'deactivating', subState: 'stop-sigterm' })) };
    assert.equal(tracker.classify(partialClosing, 64000).state, 'closing');
    assert.equal(tracker.classify(closedTopology(), 65000).state, 'closed');
});

test('restart/no-history requires recent systemd evidence for a partial topology', () => {
    const now = Date.parse('2026-08-17T12:00:00Z');
    const partial = { ...closedTopology(), mapper: true };
    assert.equal(inferVaultState(partial, { now }).state, 'inconsistent');
    partial.dependentServices = [
        { ...stopped('jellyfin.service'), state: 'activating', activeEnterTimestamp: new Date(now - 1000).toISOString() },
        stopped('rclone-ocean.service'), stopped('rclone-jellyfin-pool.service'),
    ];
    assert.equal(inferVaultState(partial, { now }).state, 'opening');
    partial.dependentServices[0].state = 'inactive';
    partial.dependentServices[0].activeEnterTimestamp = new Date(now - 61000).toISOString();
    assert.equal(inferVaultState(partial, { now }).state, 'inconsistent');
});

test('closed incident with rclone status 143 is healthy whether Result is exit-code or success', () => {
    const topology = closedTopology([
        stopped('jellyfin.service'),
        stopped('rclone-ocean.service', { state: 'failed', result: 'exit-code', execMainStatus: 143 }),
        stopped('rclone-jellyfin-pool.service', { state: 'inactive', result: 'success', execMainStatus: 143 }),
    ]);
    const vault = inferVaultState(topology);
    const services = interpreted(topology, vault);
    assert.equal(vault.state, 'closed');
    assert.deepEqual(services.map(service => service.classification), ['Off — vault closed', 'Off — vault closed', 'Off — vault closed']);
    assert.equal(deriveMediaSummary(vault, services).label, 'Off');
    assert.equal(calculateOverallStatus({ vault, criticalFailures: [], attention: [] }).label, 'Healthy');
});

test('service interpretation catches failures and mount ownership contradictions', () => {
    const topology = openTopology();
    let vault = inferVaultState(topology);
    let services = interpreted(topology, vault);
    assert.ok(services.every(service => service.classification === 'Online'));

    topology.dependentServices[0] = stopped('jellyfin.service');
    services = interpreted(topology, vault);
    assert.equal(services[0].classification, 'Off');
    assert.equal(services[0].severity, 'warning');

    topology.dependentServices[1] = { ...stopped('rclone-ocean.service'), state: 'failed', result: 'exit-code', execMainStatus: 1 };
    services = interpreted(topology, vault);
    assert.equal(services[1].classification, 'Inconsistent');

    const noMount = openTopology();
    noMount.cloudMounts[0] = { ...noMount.cloudMounts[0], present: false, fuse: false };
    vault = inferVaultState(noMount);
    services = interpreted(noMount, vault);
    assert.equal(services[1].classification, 'Inconsistent');
    assert.equal(services[0].classification, 'Inconsistent');
});

test('non-143 rclone failure while closed remains failed and degraded', () => {
    const topology = closedTopology([
        stopped('jellyfin.service'),
        { ...stopped('rclone-ocean.service'), state: 'failed', result: 'exit-code', execMainStatus: 1 },
        stopped('rclone-jellyfin-pool.service'),
    ]);
    const vault = inferVaultState(topology);
    const services = interpreted(topology, vault);
    assert.equal(services[1].classification, 'Failed');
    assert.equal(deriveMediaSummary(vault, services).label, 'Degraded');
});

test('overall precedence preserves unrelated critical and attention signals while closed', () => {
    const vault = inferVaultState(closedTopology());
    assert.equal(calculateOverallStatus({ vault, criticalFailures: [{ vaultDependent: false }], attention: ['reminder'] }).label, 'Degraded');
    assert.equal(calculateOverallStatus({ vault, criticalFailures: [], attention: ['reminder'] }).label, 'Attention');
    assert.equal(calculateOverallStatus({ vault, criticalFailures: [], attention: [] }).label, 'Healthy');
    assert.equal(calculateOverallStatus({ vault: inferVaultState(openTopology()), criticalFailures: [], attention: [] }).label, 'Healthy');
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
