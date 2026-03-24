export class TtlCache {
    constructor() {
        this.store = new Map();
    }

    async get(key, ttlMs, producer) {
        const current = this.store.get(key);
        const now = Date.now();
        if (current && current.expiresAt > now) return current.value;

        const value = await producer();
        this.store.set(key, { value, expiresAt: now + ttlMs });
        return value;
    }

    clear(prefix = '') {
        for (const key of this.store.keys()) {
            if (!prefix || key.startsWith(prefix)) this.store.delete(key);
        }
    }
}
