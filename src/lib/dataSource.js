import { shouldUseFixtureData } from '../config/settings.js';
import { evidenceSnapshot } from '../fixtures/evidenceSnapshot.js';

export function withDataSource(key, liveCollector) {
    return async function collect() {
        if (shouldUseFixtureData()) {
            return structuredClone(evidenceSnapshot[key]);
        }

        const live = await liveCollector();
        if (live) return live;
        return structuredClone(evidenceSnapshot[key]);
    };
}
