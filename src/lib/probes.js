export async function httpProbe(url) {
    const startedAt = Date.now();
    try {
        const response = await fetch(url, { method: 'GET' });
        return {
            ok: response.ok,
            status: response.status,
            latencyMs: Date.now() - startedAt,
        };
    } catch (error) {
        return {
            ok: false,
            status: null,
            latencyMs: Date.now() - startedAt,
            error: error.message,
        };
    }
}
