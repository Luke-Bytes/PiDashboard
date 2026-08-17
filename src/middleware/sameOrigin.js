export function sameOriginOnly(req, res, next) {
    if (req.method !== 'POST') return next();
    const origin = req.get('origin');
    if (!origin) return res.status(403).json({ error: 'Origin header required' });
    try {
        const parsed = new URL(origin);
        const forwardedProto = req.get('x-forwarded-proto')?.split(',')[0].trim();
        const expectedProtocol = `${forwardedProto || req.protocol}:`;
        const expectedHost = req.get('x-forwarded-host')?.split(',')[0].trim() || req.get('host');
        if (parsed.protocol !== expectedProtocol || parsed.host !== expectedHost) {
            return res.status(403).json({ error: 'Foreign origin rejected' });
        }
    } catch {
        return res.status(403).json({ error: 'Invalid origin rejected' });
    }
    return next();
}
