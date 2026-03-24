export const CRITICAL_SYSTEMD_SERVICES = [
    { name: 'nginx', label: 'NGINX', critical: true, category: 'edge', ports: [443] },
    { name: 'pm2-luke', label: 'PM2 Runtime', critical: true, category: 'apps' },
    { name: 'pihole-FTL', label: 'Pi-hole FTL', critical: true, category: 'dns', ports: [53] },
    { name: 'unbound', label: 'Unbound', critical: true, category: 'dns' },
    { name: 'mongod', label: 'MongoDB', critical: true, category: 'data', ports: [27017] },
    { name: 'jellyfin', label: 'Jellyfin', critical: false, category: 'media', ports: [8096] },
    { name: 'fail2ban', label: 'Fail2Ban', critical: false, category: 'security' },
    { name: 'smartmontools', label: 'SMART Monitoring', critical: false, category: 'storage' },
    { name: 'ssh', label: 'SSH', critical: true, category: 'access', ports: [22] },
    { name: 'NetworkManager', label: 'NetworkManager', critical: true, category: 'network' },
];

export const PM2_APP_METADATA = {
    'pi-dashboard': {
        label: 'Pi Dashboard',
        critical: true,
        port: 4000,
        proxyPath: '/dashboard/api',
        cwd: '/home/luke/PiDashboard',
    },
    restapi: {
        label: 'Rest API',
        critical: true,
        port: 3000,
        proxyPath: '/restapi',
        cwd: '/home/luke/RestAPI',
    },
    policy: {
        label: 'Policy API',
        critical: true,
        port: 2300,
        proxyHost: 'policy.anniwars.win',
        cwd: '/home/luke/ValidationAPI',
    },
    TeamsBot: {
        label: 'TeamsBot',
        critical: false,
        cwd: '/home/luke/TeamsBot',
    },
    'mc-waker': {
        label: 'Minecraft Waker',
        critical: false,
    },
    playit: {
        label: 'playit',
        critical: false,
        ports: [46215, 46217],
    },
    TeamsBotDev: {
        label: 'TeamsBot Dev',
        critical: false,
    },
    'mc-autostop': {
        label: 'MC Auto Stop',
        critical: false,
    },
    'mc-survival': {
        label: 'MC Survival',
        critical: false,
    },
    'paper-1.17.1': {
        label: 'Paper 1.17.1',
        critical: false,
    },
};

export const PROXY_ROUTES = [
    {
        id: 'dashboard',
        host: 'anniwars.win',
        label: 'Dashboard',
        publicPath: '/dashboard/',
        upstream: { kind: 'static+api', target: '/home/luke/PiDashboard/public + 127.0.0.1:4000' },
        probes: [
            { id: 'dashboard-api', label: 'Dashboard API', url: 'http://127.0.0.1:4000/api/healthz' },
        ],
        critical: true,
    },
    {
        id: 'restapi',
        host: 'anniwars.win',
        label: 'REST API',
        publicPath: '/restapi/',
        upstream: { kind: 'http', target: '127.0.0.1:3000' },
        probes: [
            { id: 'restapi-upstream', label: 'REST API upstream', url: 'http://127.0.0.1:3000/' },
        ],
        critical: true,
    },
    {
        id: 'jellyfin',
        host: 'anniwars.win',
        label: 'Jellyfin',
        publicPath: '/jellyfin/',
        upstream: { kind: 'http', target: '127.0.0.1:8096' },
        probes: [
            { id: 'jellyfin-upstream', label: 'Jellyfin upstream', url: 'http://127.0.0.1:8096/health' },
        ],
        critical: false,
    },
    {
        id: 'policy',
        host: 'policy.anniwars.win',
        label: 'Policy API',
        publicPath: '/',
        upstream: { kind: 'http', target: '127.0.0.1:2300' },
        probes: [
            { id: 'policy-upstream', label: 'Policy upstream', url: 'http://127.0.0.1:2300/' },
        ],
        critical: true,
    },
    {
        id: 'pihole-admin',
        host: 'anniwars.win',
        label: 'Pi-hole Admin',
        publicPath: '/admin/ and /pihole/',
        upstream: { kind: 'http', target: 'LAN-only reverse proxy' },
        probes: [],
        critical: true,
        notes: 'Restricted to LAN inside NGINX.',
    },
];

export const CRITICAL_MOUNTS = [
    { mount: '/', label: 'Root SSD', warningPct: 85, criticalPct: 90 },
    { mount: '/srv/secure', label: 'securevault', warningPct: 75, criticalPct: 90 },
    { mount: '/var/log', label: 'Log tmpfs', warningPct: 70, criticalPct: 90 },
    { mount: '/home/luke/.pm2/logs', label: 'PM2 log tmpfs', warningPct: 70, criticalPct: 90 },
];

export const NETWORK_INTERFACES = [
    { name: 'eth0', label: 'LAN', expectedState: 'up', role: 'default-route' },
    { name: 'wg0', label: 'WireGuard LAN', expectedState: 'up', role: 'vpn-server' },
    { name: 'wg-surfshark', label: 'Surfshark', expectedState: 'up', role: 'vpn-client' },
];

export const MAINTENANCE_TIMERS = [
    { name: 'certbot.timer', label: 'Certbot renew' },
    { name: 'apt-daily.timer', label: 'APT daily' },
    { name: 'apt-daily-upgrade.timer', label: 'APT unattended upgrades' },
    { name: 'cf-ddns.timer', label: 'Cloudflare DDNS' },
    { name: 'surfshark-update-whitelist.timer', label: 'Surfshark whitelist update' },
    { name: 'systemd-tmpfiles-clean.timer', label: 'tmpfiles clean' },
    { name: 'e2scrub_all.timer', label: 'Filesystem scrub' },
    { name: 'log-prune.timer', label: 'Log prune' },
    { name: 'fstrim.timer', label: 'SSD trim' },
];

export const ACTION_DEFINITIONS = [
    {
        id: 'refresh-overview',
        label: 'Refresh Status Cache',
        description: 'Invalidate cached collector data and refetch.',
        type: 'internal',
        confirmation: false,
    },
    {
        id: 'probe-routes',
        label: 'Run Route Probes',
        description: 'Re-run local upstream reachability checks.',
        type: 'internal',
        confirmation: false,
    },
    {
        id: 'restart-dashboard',
        label: 'Restart Dashboard',
        description: 'Restart the pi-dashboard PM2 app.',
        type: 'command',
        command: 'pm2',
        args: ['restart', 'pi-dashboard'],
        confirmation: true,
    },
    {
        id: 'reload-nginx',
        label: 'Reload NGINX',
        description: 'Reload NGINX configuration if the service user is permitted.',
        type: 'command',
        command: 'sudo',
        args: ['-n', 'systemctl', 'reload', 'nginx'],
        confirmation: true,
    },
    {
        id: 'restart-pihole-ftl',
        label: 'Restart Pi-hole FTL',
        description: 'Restart Pi-hole FTL if the service user is permitted.',
        type: 'command',
        command: 'sudo',
        args: ['-n', 'systemctl', 'restart', 'pihole-FTL'],
        confirmation: true,
    },
];
