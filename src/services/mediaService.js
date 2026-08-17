import fs from 'node:fs/promises';

import { collectMedia } from '../collectors/media.js';
import { APP_CONFIG, shouldUseFixtureData } from '../config/settings.js';
import { isValidProviderId } from '../lib/cloudQuota.js';
import { TtlCache } from '../lib/cache.js';
import { addCalendarMonths, confirmProviderLogin, londonDate } from './reminderService.js';

const cache = new TtlCache();
const fixtureLogins = new Map();

function applyFixtureLogins(media) {
    if (!shouldUseFixtureData() || fixtureLogins.size === 0) return media;
    for (const provider of media.providers || []) {
        const date = fixtureLogins.get(provider.id);
        if (date) provider.reminder = { state: 'current', severity: 'healthy', label: `Due ${addCalendarMonths(date, 6)}`, nextDueDate: addCalendarMonths(date, 6) };
    }
    if ((media.providers || []).every(provider => provider.reminder?.severity !== 'warning')) media.overall = { label: 'Healthy', severity: 'healthy' };
    return media;
}

export async function getMedia(force = false) {
    if (force) cache.clear();
    return cache.get('media', APP_CONFIG.mediaTtlMs, async () => applyFixtureLogins(await collectMedia()));
}

async function activeProviderIds() {
    const media = await getMedia();
    return (media.providers || []).map(provider => provider.id).filter(isValidProviderId);
}

export async function recordProviderLogin(provider, options = {}) {
    const activeProviders = options.activeProviders || await activeProviderIds();
    if (!isValidProviderId(provider)) throw Object.assign(new Error('Invalid provider identifier'), { statusCode: 400 });
    if (!activeProviders.includes(provider)) throw Object.assign(new Error('Provider is not active'), { statusCode: 404 });
    if (shouldUseFixtureData()) {
        const date = londonDate(options.now ?? Date.now());
        const changed = fixtureLogins.get(provider) !== date;
        fixtureLogins.set(provider, date);
        cache.clear();
        return { ok: true, changed, provider, fixture: true };
    }
    const result = await confirmProviderLogin(provider, { ...options, activeProviders });
    cache.clear();
    return {
        ok: true,
        changed: result.changed,
        provider,
        reminder: result.state.providers[provider],
    };
}

export async function readActiveProvidersFromCache(filePath = APP_CONFIG.media.cloudCachePath) {
    try {
        const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
        const registry = parsed.providerRegistry || parsed.lastKnownProviders || [];
        return registry.map(item => typeof item === 'string' ? item : item?.id).filter(isValidProviderId);
    } catch { return []; }
}
