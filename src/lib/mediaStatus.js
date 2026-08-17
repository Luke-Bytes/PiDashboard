const STOPPED_STATES = new Set(['inactive', 'dead', 'stopped', 'failed']);
const RUNNING_STATES = new Set(['active', 'running']);
const CLEAN_RESULTS = new Set(['', 'success']);

function isPresent(item) {
    return typeof item === 'boolean' ? item : Boolean(item?.present);
}

function isRunning(service) {
    return RUNNING_STATES.has(service?.state) && !['dead', 'exited', 'failed'].includes(service?.subState);
}

function eventTime(value) {
    if (!value || value === 'n/a') return 0;
    if (Number.isFinite(value)) return value;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
}

function recentTransitionDirection(services, now, graceMs) {
    let openingAt = 0;
    let closingAt = 0;
    for (const service of services) {
        if (service.state === 'activating') openingAt = Math.max(openingAt, now);
        if (service.state === 'deactivating') closingAt = Math.max(closingAt, now);
        openingAt = Math.max(openingAt, eventTime(service.activeEnterTimestamp));
        closingAt = Math.max(closingAt, eventTime(service.inactiveEnterTimestamp));
    }
    if (now - Math.max(openingAt, closingAt) > graceMs) return null;
    return openingAt > closingAt ? { state: 'opening', at: openingAt } : closingAt > 0 ? { state: 'closing', at: closingAt } : null;
}

function topologyFacts(input) {
    const cloudMounts = input.cloudMounts || [];
    const bindMounts = input.bindMounts || input.requiredPaths || [];
    const vaultMount = typeof input.vaultMount === 'object' ? input.vaultMount : { present: Boolean(input.vaultMount), source: input.vaultMountSource };
    const expectedSource = input.expectedVaultSource || '/dev/mapper/securevault';
    const services = input.dependentServices || [];
    const mapper = Boolean(input.mapper);
    const marker = Boolean(input.marker);
    const vaultPresent = isPresent(vaultMount);
    const vaultSourceCorrect = vaultPresent && vaultMount.source === expectedSource;
    const bindsPresent = bindMounts.every(isPresent);
    const bindsAbsent = bindMounts.every(item => !isPresent(item));
    const cloudsPresent = cloudMounts.every(item => isPresent(item) && item.fuse !== false);
    const cloudsAbsent = cloudMounts.every(item => !isPresent(item));
    const servicesStopped = services.every(service => STOPPED_STATES.has(service.state) && !isRunning(service));
    return {
        fullyOpen: mapper && marker && vaultSourceCorrect && bindsPresent && cloudsPresent,
        fullyClosed: !mapper && !marker && !vaultPresent && bindsAbsent && cloudsAbsent && servicesStopped,
        services,
    };
}

function vaultResult(state, detail) {
    if (state === 'open') return { state, classification: 'Open', severity: 'healthy', intentionalLock: false, detail };
    if (state === 'closed') return { state, classification: 'Closed', severity: 'healthy', intentionalLock: true, detail };
    if (state === 'opening') return { state, classification: 'Opening', severity: 'inactive', intentionalLock: false, detail };
    if (state === 'closing') return { state, classification: 'Closing', severity: 'inactive', intentionalLock: false, detail };
    return { state: 'inconsistent', classification: 'Inconsistent', severity: 'critical', intentionalLock: false, detail };
}

export function inferVaultState(input, context = {}) {
    const now = context.now ?? Date.now();
    const graceMs = context.graceMs ?? 60000;
    const facts = topologyFacts(input);
    if (facts.fullyOpen) return vaultResult('open', 'All required vault and media mounts are present');
    if (facts.fullyClosed) return vaultResult('closed', 'Media vault closed');

    const recent = recentTransitionDirection(facts.services, now, graceMs);
    const direction = recent?.state || (context.previousStableState === 'open' ? 'closing' : context.previousStableState === 'closed' ? 'opening' : null);
    const startedAt = context.transitionStartedAt || recent?.at || (context.previousStableState ? now : 0);
    if (direction && startedAt && now - startedAt <= graceMs) {
        return { ...vaultResult(direction, `Vault ${direction}; transition grace period active`), transitionStartedAt: startedAt };
    }
    return vaultResult('inconsistent', direction ? 'Vault transition exceeded the grace period' : 'Partial vault topology has no recent transition evidence');
}

export function createVaultStateTracker(graceMs = 60000) {
    let previousStableState = null;
    let transitionStartedAt = null;
    let transitionDirection = null;
    return {
        classify(input, now = Date.now()) {
            const result = inferVaultState(input, { now, graceMs, previousStableState, transitionStartedAt });
            if (result.state === 'open' || result.state === 'closed') {
                previousStableState = result.state;
                transitionStartedAt = null;
                transitionDirection = null;
            } else if (result.state === 'opening' || result.state === 'closing') {
                if (transitionDirection !== result.state) transitionStartedAt = result.transitionStartedAt || now;
                else transitionStartedAt ||= result.transitionStartedAt || now;
                transitionDirection = result.state;
                result.transitionStartedAt = transitionStartedAt;
            }
            return result;
        },
        reset() {
            previousStableState = null;
            transitionStartedAt = null;
            transitionDirection = null;
        },
    };
}

function serviceResult(service) {
    return service.result || '';
}

function execStatus(service) {
    const value = Number(service.execMainStatus);
    return Number.isFinite(value) ? value : null;
}

function cleanStop(service) {
    const status = execStatus(service);
    return STOPPED_STATES.has(service.state) && CLEAN_RESULTS.has(serviceResult(service)) && (status === null || status === 0);
}

function interpreted(service, classification, expected, healthy, detail, severity) {
    return { ...service, classification, running: isRunning(service), expected, healthy, detail, severity };
}

function expectedForVault(vaultState) {
    if (['open', 'opening'].includes(vaultState)) return true;
    if (['closed', 'closing'].includes(vaultState)) return false;
    return null;
}

function dependenciesReady(topology) {
    return Boolean(topology.mapperPresent && topology.markerPresent && topology.mountPresent && topology.mountSourceCorrect &&
        (topology.requiredPaths || []).every(isPresent) && (topology.cloudMounts || []).every(item => item.present && item.fuse));
}

function classifyJellyfin(service, vault, topology) {
    const expected = expectedForVault(vault.state);
    if (service.state === 'activating') return interpreted(service, 'Starting', expected, true, 'Jellyfin is starting', 'inactive');
    if (service.state === 'deactivating') return interpreted(service, 'Stopping', expected, true, 'Jellyfin is stopping', 'inactive');
    if (isRunning(service)) {
        if (dependenciesReady(topology)) return interpreted(service, 'Online', expected, true, 'Running with all required vault mounts', 'healthy');
        return interpreted(service, 'Inconsistent', expected, false, 'Running while required vault mounts are absent', 'critical');
    }
    if (service.state === 'failed' || (!CLEAN_RESULTS.has(serviceResult(service)) && serviceResult(service))) {
        return interpreted(service, 'Failed', expected, false, `Systemd failure (${serviceResult(service) || 'failed'}, status ${execStatus(service) ?? 'unknown'})`, 'critical');
    }
    if (cleanStop(service)) {
        if (vault.state === 'closed') return interpreted(service, 'Off — vault closed', false, true, 'Cleanly stopped because the media vault is closed', 'inactive');
        return interpreted(service, 'Off', expected, vault.state === 'closing', vault.state === 'open' ? 'Cleanly stopped while the vault is open' : 'Cleanly stopped', vault.state === 'open' ? 'warning' : 'inactive');
    }
    return interpreted(service, 'Unknown', expected, false, 'Systemd state could not be interpreted', 'inactive');
}

function classifyRclone(service, vault, mount) {
    const expected = expectedForVault(vault.state);
    const mountReady = Boolean(mount?.present && mount?.fuse);
    if (service.state === 'activating') return interpreted(service, 'Starting', expected, true, 'Rclone mount is starting', 'inactive');
    if (service.state === 'deactivating') return interpreted(service, 'Stopping', expected, true, 'Rclone mount is stopping', 'inactive');
    if (isRunning(service) && !mountReady) return interpreted(service, 'Inconsistent', expected, false, `Running without expected FUSE mount ${mount?.path || ''}`.trim(), 'critical');
    if (!isRunning(service) && mount?.present) return interpreted(service, 'Inconsistent', expected, false, `Mount ${mount.path} is present without a running owner`, 'critical');
    if (isRunning(service) && mountReady) return interpreted(service, 'Online', expected, true, `Expected FUSE mount ${mount.path} is present`, 'healthy');
    const status = execStatus(service);
    if (vault.state === 'closed' && !mount?.present && status === 143 && !isRunning(service)) {
        return interpreted(service, 'Off — vault closed', false, true, 'Stopped with expected SIGTERM status 143 while the vault is closed', 'inactive');
    }
    const failed = service.state === 'failed' || (!CLEAN_RESULTS.has(serviceResult(service)) && serviceResult(service));
    if (failed) return interpreted(service, 'Failed', expected, false, `Systemd failure (${serviceResult(service) || 'failed'}, status ${status ?? 'unknown'})`, 'critical');
    if (cleanStop(service)) {
        if (vault.state === 'closed') return interpreted(service, 'Off — vault closed', false, true, 'Cleanly stopped because the media vault is closed', 'inactive');
        return interpreted(service, 'Off', expected, false, 'Expected mount service is not running', vault.state === 'open' ? 'critical' : 'inactive');
    }
    return interpreted(service, 'Unknown', expected, false, 'Systemd state could not be interpreted', 'inactive');
}

export function interpretMediaServices(services, vault, topology) {
    const mountByService = new Map([
        ['rclone-ocean.service', (topology.cloudMounts || []).find(item => item.role === 'ocean') || (topology.cloudMounts || [])[0]],
        ['rclone-jellyfin-pool.service', (topology.cloudMounts || []).find(item => item.role === 'pool') || (topology.cloudMounts || [])[1]],
    ]);
    return services.map(service => service.name === 'jellyfin.service'
        ? classifyJellyfin(service, vault, topology)
        : classifyRclone(service, vault, mountByService.get(service.name)));
}

export function deriveMediaSummary(vault, services) {
    if (vault.state === 'inconsistent' || services.some(service => ['Failed', 'Inconsistent'].includes(service.classification))) return { state: 'degraded', label: 'Degraded', severity: 'critical' };
    if (vault.state === 'opening' || services.some(service => service.classification === 'Starting')) return { state: 'starting', label: 'Starting', severity: 'inactive' };
    if (vault.state === 'closing' || services.some(service => service.classification === 'Stopping')) return { state: 'stopping', label: 'Stopping', severity: 'inactive' };
    if (vault.state === 'closed' && services.every(service => service.healthy)) return { state: 'off', label: 'Off', severity: 'healthy' };
    if (vault.state === 'open' && services.every(service => service.classification === 'Online')) return { state: 'online', label: 'Online', severity: 'healthy' };
    if (services.some(service => service.classification === 'Unknown')) return { state: 'unknown', label: 'Unknown', severity: 'inactive' };
    return { state: 'degraded', label: 'Degraded', severity: services.some(service => service.severity === 'critical') ? 'critical' : 'warning' };
}

export function calculateOverallStatus({ vault, criticalFailures = [], attention = [] }) {
    if (criticalFailures.length > 0 || vault?.state === 'inconsistent') return { label: 'Degraded', severity: 'critical', detail: vault?.state === 'inconsistent' ? vault.detail : undefined };
    if (attention.length > 0) return { label: 'Attention', severity: 'warning' };
    return { label: 'Healthy', severity: 'healthy', detail: vault?.state === 'closed' ? 'Media vault closed' : undefined };
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
