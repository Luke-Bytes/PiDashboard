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
        healthMode: 'process',
        notes: [
            'No passive HTTP probe by default; health is based on PM2 runtime and operator-triggered inspection.',
            'The service has strict route semantics and some HTTP endpoints create telemetry noise.',
        ],
        safeActions: [
            'policy-start',
            'policy-stop',
            'policy-restart',
            'policy-rebuild',
        ],
        inspectReports: [
            'policy-db-inspect',
            'policy-recent-checks',
            'policy-recent-checks-by-build',
            'policy-recent-key-requests',
            'policy-recent-users',
            'policy-blocked-fingerprints',
        ],
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
        probes: [],
        critical: true,
        healthMode: 'process',
        notes: 'Process-managed service. Generic HTTP root probing is intentionally disabled.',
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

export const POLICY_ACTION_DEFINITIONS = [
    {
        id: 'policy-start',
        label: 'Start Policy',
        description: 'Start the policy PM2 app.',
        command: 'pm2',
        args: ['start', 'policy'],
        confirmation: true,
    },
    {
        id: 'policy-stop',
        label: 'Stop Policy',
        description: 'Stop the policy PM2 app.',
        command: 'pm2',
        args: ['stop', 'policy'],
        confirmation: true,
    },
    {
        id: 'policy-restart',
        label: 'Restart Policy',
        description: 'Restart the policy PM2 app.',
        command: 'pm2',
        args: ['restart', 'policy'],
        confirmation: true,
    },
    {
        id: 'policy-rebuild',
        label: 'Rebuild Policy',
        description: 'Run the policy project rebuild script from the ValidationAPI repository.',
        command: 'npm',
        args: ['run', 'rebuild'],
        cwd: '/home/luke/ValidationAPI',
        confirmation: true,
        timeout: 120000,
    },
];

export const POLICY_INSPECT_REPORTS = [
    {
        id: 'policy-db-inspect',
        label: 'DB Inspect',
        description: 'Run the general policy database inspection script.',
        command: 'npm',
        args: ['run', 'db:inspect'],
        cwd: '/home/luke/ValidationAPI',
        timeout: 30000,
    },
    {
        id: 'policy-recent-checks',
        label: 'Recent Checks',
        description: 'Show recent policy checks.',
        command: 'npm',
        args: ['run', 'db:recent-checks'],
        cwd: '/home/luke/ValidationAPI',
        timeout: 30000,
    },
    {
        id: 'policy-recent-checks-by-build',
        label: 'Checks by Build',
        description: 'Show recent checks grouped by build.',
        command: 'npm',
        args: ['run', 'db:recent-checks-by-build'],
        cwd: '/home/luke/ValidationAPI',
        timeout: 30000,
    },
    {
        id: 'policy-recent-key-requests',
        label: 'Recent Key Requests',
        description: 'Show recent public-key request activity.',
        command: 'npm',
        args: ['run', 'db:recent-key-requests'],
        cwd: '/home/luke/ValidationAPI',
        timeout: 30000,
    },
    {
        id: 'policy-recent-users',
        label: 'Recent Users',
        description: 'Show recent users seen by the policy service.',
        command: 'npm',
        args: ['run', 'db:recent-users'],
        cwd: '/home/luke/ValidationAPI',
        timeout: 30000,
    },
    {
        id: 'policy-blocked-fingerprints',
        label: 'Blocked Fingerprints',
        description: 'Show blocked fingerprints from access control data.',
        command: 'npm',
        args: ['run', 'db:blocked-fingerprints'],
        cwd: '/home/luke/ValidationAPI',
        timeout: 30000,
    },
];
