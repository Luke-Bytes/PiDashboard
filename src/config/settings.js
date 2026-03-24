const DATA_MODE = process.env.DASHBOARD_DATA_MODE || 'auto';

export function shouldUseFixtureData() {
    if (DATA_MODE === 'fixture') return true;
    if (DATA_MODE === 'live') return false;
    return !(process.platform === 'linux' && process.arch === 'arm64');
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
};
