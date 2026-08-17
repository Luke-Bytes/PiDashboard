const STOPPED_STATES = new Set(['inactive', 'dead', 'stopped']);

export function inferVaultState({ mapper, marker, vaultMount, cloudMounts = [], dependentServices = [] }) {
    const cloudAbsent = cloudMounts.every(mount => !mount.present);
    const servicesStopped = dependentServices.every(service => STOPPED_STATES.has(service.state));
    const allPresent = mapper && marker && vaultMount && cloudMounts.every(mount => mount.present);

    if (allPresent) return { state: 'unlocked', severity: 'healthy', intentionalLock: false };
    if (!mapper && !marker && !vaultMount && cloudAbsent && servicesStopped) {
        return { state: 'locked', severity: 'inactive', intentionalLock: true };
    }
    return { state: 'inconsistent', severity: 'critical', intentionalLock: false };
}

export function calculateOverallStatus({ vault, criticalFailures = [], attention = [] }) {
    const unrelatedCritical = criticalFailures.filter(item => !item.vaultDependent);
    const dependentCritical = criticalFailures.filter(item => item.vaultDependent);
    if (unrelatedCritical.length > 0) return { label: 'Degraded', severity: 'critical' };
    if (vault?.intentionalLock && dependentCritical.length === 0) return { label: 'Vault Locked', severity: 'inactive' };
    if (criticalFailures.length > 0 || vault?.state === 'inconsistent') return { label: 'Degraded', severity: 'critical' };
    if (attention.length > 0) return { label: 'Attention', severity: 'warning' };
    return { label: 'Healthy', severity: 'healthy' };
}

export function providerFailure(provider) {
    return provider.errorCategory === 'authentication_failure' || (provider.reachability === 'failed' && provider.errorCategory !== 'quota_unsupported');
}

export function healthTimerStatus(timer, service, now = Date.now(), staleMs = 9 * 86400000) {
    if (!timer || timer.state !== 'active') return { state: 'disabled', severity: 'warning' };
    if (service?.result && !['success', ''].includes(service.result)) return { state: 'failed', severity: 'critical' };
    const last = timer.lastTrigger ? new Date(timer.lastTrigger).getTime() : 0;
    if (!last || now - last > staleMs) return { state: 'stale', severity: 'warning' };
    return { state: 'healthy', severity: 'healthy' };
}
