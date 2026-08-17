const active = name => ({ name, state: 'active' });
const stopped = name => ({ name, state: 'inactive' });

export const mediaScenarios = {
    unlockedHealthy: { mapper: true, marker: true, vaultMount: true, cloudMounts: [{ present: true }, { present: true }], dependentServices: [active('jellyfin'), active('pool')] },
    intentionalLock: { mapper: false, marker: false, vaultMount: false, cloudMounts: [{ present: false }, { present: false }], dependentServices: [stopped('jellyfin'), stopped('pool')] },
    unexpectedVaultLoss: { mapper: true, marker: false, vaultMount: false, cloudMounts: [{ present: false }], dependentServices: [stopped('jellyfin')] },
    providerUnreachable: { provider: { id: 'ocean-a', reachability: 'failed', errorCategory: 'unreachable' } },
    providerAuthenticationFailure: { provider: { id: 'ocean-a', reachability: 'failed', errorCategory: 'authentication_failure' } },
    providerAdded: { before: ['ocean-a'], after: ['ocean-a', 'ocean-b'] },
    providerRemoved: { before: ['ocean-a', 'ocean-b'], after: ['ocean-a'] },
    reminderMissing: { confirmedDateLondon: null },
    reminderApproaching: { confirmedDateLondon: '2026-02-28', now: '2026-08-01T12:00:00Z' },
    reminderOverdue: { confirmedDateLondon: '2026-01-31', now: '2026-08-17T12:00:00Z' },
    sameDayReset: { confirmations: ['2026-08-17T08:00:00Z', '2026-08-17T18:00:00Z'] },
    quotaUnavailableCached: { reachability: 'failed', quota: { total: 100, used: 40, free: 60 } },
    poolServiceFailed: { timer: { state: 'active' }, service: { result: 'exit-code' } },
    activeWithoutFuse: { service: active('pool'), mount: { present: false, fuse: false } },
    rootLowSpace: { path: '/', usedPct: 91, severity: 'critical' },
    vaultLowSpace: { path: '/srv/secure', usedPct: 91, severity: 'critical' },
    healthTimerDisabled: { timer: { state: 'inactive' } },
    healthTimerStale: { timer: { state: 'active', lastTrigger: '2026-01-01T00:00:00Z' } },
    healthTimerFailed: { timer: { state: 'active', lastTrigger: '2026-08-16T00:00:00Z' }, service: { result: 'exit-code' } },
    healthTimerSuccessful: { timer: { state: 'active', lastTrigger: '2026-08-16T00:00:00Z' }, service: { result: 'success' } },
};
