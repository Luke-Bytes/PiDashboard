export function bytesToGiB(bytes) {
    return Number((bytes / 1024 / 1024 / 1024).toFixed(1));
}

export function bytesToMiB(bytes) {
    return Number((bytes / 1024 / 1024).toFixed(1));
}

export function secondsToDuration(seconds) {
    if (!seconds || seconds < 0) return '0m';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

export function pickSeverity(value, warning, critical) {
    if (value >= critical) return 'critical';
    if (value >= warning) return 'warning';
    return 'healthy';
}

export function normalizeStateSeverity(state, critical = false) {
    if (state === 'active' || state === 'online' || state === 'waiting') return 'healthy';
    if (state === 'inactive' || state === 'stopped') return critical ? 'critical' : 'inactive';
    return critical ? 'critical' : 'warning';
}

export function statusText(ok, fallback = 'Unknown') {
    if (ok === true) return 'Healthy';
    if (ok === false) return 'Degraded';
    return fallback;
}
