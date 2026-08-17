import { shouldUseFixtureData } from '../config/settings.js';
import { evidenceSnapshot } from '../fixtures/evidenceSnapshot.js';

export function withDataSource(key, liveCollector) {
    return async function collect() {
        if (shouldUseFixtureData()) {
            return structuredClone(evidenceSnapshot[key]);
        }

        try {
            const live = await liveCollector();
            if (live) return live;
        } catch {}
        return {
            generatedAt: Date.now(),
            available: false,
            status: 'unavailable',
            error: `${key} live collection unavailable`,
        };
    };
}
