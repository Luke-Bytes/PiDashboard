import { APP_CONFIG } from '../config/settings.js';

export function sameOriginOnly(req, res, next) {
    if (req.method !== 'POST') return next();
    const origin = req.get('origin');
    if (!origin) return res.status(403).json({ error: 'Origin header required' });
    try {
        const parsed = new URL(origin);
        const forwardedProto = req.get('x-forwarded-proto')?.split(',')[0].trim();
        const expectedProtocol = `${forwardedProto || req.protocol}:`;
        const expectedHost = req.get('x-forwarded-host')?.split(',')[0].trim() || req.get('host');
        const requestOrigin = `${expectedProtocol}//${expectedHost}`;
        let configuredOrigin = null;
        try { configuredOrigin = new URL(APP_CONFIG.publicBaseUrl).origin; } catch { /* Invalid optional configuration cannot grant access. */ }
        if (parsed.origin !== requestOrigin && parsed.origin !== configuredOrigin) {
            return res.status(403).json({ error: 'Foreign origin rejected' });
        }
    } catch {
        return res.status(403).json({ error: 'Invalid origin rejected' });
    }
    return next();
}
