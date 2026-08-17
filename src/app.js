import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApiRouter } from './routes/api.js';
import { sameOriginOnly } from './middleware/sameOrigin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '../public');

export function createApp() {
    const app = express();
    app.disable('x-powered-by');
    app.use(express.json());
    app.use(sameOriginOnly);

    app.use('/api', createApiRouter());

    // Useful for local development; production still serves static files via NGINX.
    app.use(express.static(publicDir));

    app.use((err, _req, res, _next) => {
        const message = err instanceof Error ? err.message : String(err);
        res.status(err?.statusCode || 500).json({ error: message });
    });

    return app;
}
