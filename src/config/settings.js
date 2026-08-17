const DATA_MODE = process.env.DASHBOARD_DATA_MODE || 'live';

export function shouldUseFixtureData() {
    if (DATA_MODE === 'fixture') return true;
    return false;
}

export const APP_CONFIG = {
    host: process.env.HOST || '127.0.0.1',
    port: Number(process.env.PORT || 4000),
    dataMode: DATA_MODE,
    overviewTtlMs: 5000,
    standardTtlMs: 10000,
    logsTtlMs: 15000,
    maintenanceTtlMs: 60000,
    expensiveTtlMs: 300000,
    logsDir: process.env.PM2_LOG_DIR || '/home/luke/.pm2/logs',
    publicBaseUrl: process.env.DASHBOARD_PUBLIC_BASE_URL || 'https://anniwars.win',
    piholeApiUrl: process.env.PIHOLE_API_URL || '',
    piholeApiToken: process.env.PIHOLE_API_TOKEN || '',
    mediaTtlMs: 15000,
    mediaSlowTtlMs: 60000,
    media: {
        vaultMapper: process.env.MEDIA_VAULT_MAPPER || '/dev/mapper/securevault',
        vaultMarker: process.env.MEDIA_VAULT_MARKER || '/srv/secure/.securevault-marker',
        vaultMount: process.env.MEDIA_VAULT_MOUNT || '/srv/secure',
        poolMount: process.env.MEDIA_POOL_MOUNT || '/srv/secure/cloud/pool',
        oceanMount: process.env.MEDIA_OCEAN_MOUNT || '/mnt/jellyfin-cloud/ocean-source',
        requiredPaths: (process.env.MEDIA_REQUIRED_PATHS || '/media,/var/lib/jellyfin').split(',').filter(Boolean),
        transcodePath: process.env.JELLYFIN_TRANSCODE_PATH || '/var/cache/jellyfin/transcodes',
        cloudCachePath: process.env.CLOUD_STATUS_CACHE || '/var/lib/pi-dashboard/cloud-status.json',
        reminderStatePath: process.env.PROVIDER_REMINDER_STATE || '/var/lib/pi-dashboard/provider-reminders.json',
        healthStaleMs: Number(process.env.MEDIA_HEALTH_STALE_MS || 9 * 24 * 60 * 60 * 1000),
        transitionGraceMs: Number(process.env.MEDIA_TRANSITION_GRACE_MS || 60000),
    },
};
