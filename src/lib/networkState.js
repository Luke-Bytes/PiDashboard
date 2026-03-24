function parseFlags(iface) {
    const rawFlags = iface?.flags;
    if (Array.isArray(rawFlags)) return rawFlags;
    if (typeof rawFlags === 'string') return rawFlags.split(',').map(flag => flag.trim()).filter(Boolean);
    return [];
}

function hasIpv4Address(iface) {
    return Boolean(iface?.ip4);
}

function isWireGuardLike(name) {
    return typeof name === 'string' && name.startsWith('wg');
}

export function normalizeInterfaceState(meta, iface) {
    const flags = parseFlags(iface);
    const hasUpFlag = flags.includes('UP');
    const hasCarrier = flags.includes('LOWER_UP');
    const hasAddress = hasIpv4Address(iface);
    const operstate = (iface?.operstate || '').toLowerCase();
    const wireGuardLike = isWireGuardLike(meta?.name || iface?.iface);

    if (!iface) {
        return {
            state: 'down',
            severity: meta?.expectedState === 'up' ? 'critical' : 'inactive',
        };
    }

    if (wireGuardLike) {
        if (hasAddress && operstate !== 'down') {
            return { state: 'up', severity: 'healthy' };
        }
        if (hasUpFlag || hasAddress) {
            return { state: 'warning', severity: 'warning' };
        }
        return { state: 'down', severity: meta?.expectedState === 'up' ? 'critical' : 'inactive' };
    }

    if ((operstate === 'up' || (hasUpFlag && hasCarrier)) && hasAddress) {
        return { state: 'up', severity: 'healthy' };
    }
    if (operstate === 'unknown' && hasAddress) {
        return { state: 'warning', severity: 'warning' };
    }
    if (hasUpFlag || hasAddress) {
        return { state: 'warning', severity: 'warning' };
    }

    return {
        state: 'down',
        severity: meta?.expectedState === 'up' ? 'critical' : 'inactive',
    };
}
