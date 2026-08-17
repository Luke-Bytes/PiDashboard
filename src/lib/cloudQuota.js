const SECRET_PATTERNS = [
    /(?:token|password|secret|client_secret|config_pass)\s*[:=]\s*\S+/gi,
    /(?:[A-Za-z0-9+/]{32,}={0,2})/g,
];

export function isValidProviderId(value) {
    return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value);
}

function finiteNonNegative(value) {
    return Number.isFinite(value) && value >= 0 ? value : null;
}

export function parseQuota(value) {
    const source = typeof value === 'string' ? JSON.parse(value) : value;
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('invalid quota response');
    const total = finiteNonNegative(source.total);
    const used = finiteNonNegative(source.used);
    const free = finiteNonNegative(source.free);
    const trashed = finiteNonNegative(source.trashed);
    if (total === null && used === null && free === null) throw new Error('quota unsupported');
    return { total, used, free, trashed };
}

export function aggregateQuotas(providers) {
    const reported = providers.filter(provider => provider.quota && [provider.quota.total, provider.quota.used, provider.quota.free].some(Number.isFinite));
    const sum = key => {
        const values = reported.map(provider => provider.quota[key]).filter(Number.isFinite);
        return values.length ? values.reduce((total, value) => total + value, 0) : null;
    };
    const complete = reported.length === providers.length && reported.every(provider => ['total', 'used', 'free'].every(key => Number.isFinite(provider.quota[key])));
    const largest = reported.filter(provider => Number.isFinite(provider.quota.free)).sort((a, b) => b.quota.free - a.quota.free)[0] || null;
    return {
        reportedProviders: reported.length,
        totalProviders: providers.length,
        partial: !complete,
        total: reported.length ? sum('total') : null,
        used: reported.length ? sum('used') : null,
        free: reported.length ? sum('free') : null,
        largestProviderFree: largest ? { provider: largest.id, bytes: largest.quota.free } : null,
    };
}

export function redactSecrets(value) {
    let result = String(value ?? '').replace(/[\r\n\t]+/g, ' ').slice(0, 500);
    for (const pattern of SECRET_PATTERNS) result = result.replace(pattern, '[redacted]');
    return result;
}

export function classifyQuotaError(value) {
    const safe = redactSecrets(value).toLowerCase();
    if (/timeout|timed out|deadline/.test(safe)) return 'timeout';
    if (/auth|unauthori|forbidden|invalid_grant|401|403/.test(safe)) return 'authentication_failure';
    if (/unsupported|not support|about not/.test(safe)) return 'quota_unsupported';
    return 'unreachable';
}
