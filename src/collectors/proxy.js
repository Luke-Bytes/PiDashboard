import { APP_CONFIG } from '../config/settings.js';
import { PROXY_ROUTES } from '../config/topology.js';
import { withDataSource } from '../lib/dataSource.js';
import { httpProbe } from '../lib/probes.js';

async function collectLiveProxy() {
    try {
        const routes = await Promise.all(PROXY_ROUTES.map(async route => {
            const [probeDef] = route.probes || [];
            const probe = probeDef ? await httpProbe(probeDef.url) : null;
            return {
                id: route.id,
                label: route.label,
                host: route.host,
                publicPath: route.publicPath,
                target: route.upstream.target,
                healthMode: route.healthMode || (probe ? 'http' : 'none'),
                notes: route.notes || '',
                severity: probe ? (probe.ok ? 'healthy' : route.critical ? 'critical' : 'warning') : 'healthy',
                probe,
                publicUrl: route.host === 'anniwars.win'
                    ? `${APP_CONFIG.publicBaseUrl}${route.publicPath}`
                    : `https://${route.host}${route.publicPath}`,
            };
        }));

        return { generatedAt: Date.now(), routes };
    } catch {
        return null;
    }
}

export const collectProxy = withDataSource('proxy', collectLiveProxy);
