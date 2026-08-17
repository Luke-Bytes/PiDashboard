# PiDashboard

An operational dashboard for a real Raspberry Pi admin environment. It covers host and service health, media-vault lifecycle, cached cloud capacity, login reminders, reverse-proxy topology, DNS, PM2 apps, maintenance timers, and safe admin actions.

## Running

```bash
npm install
npm start
```

Live mode is always the default and reports unavailable collectors honestly. Sample data is used only when fixture mode is explicitly selected:

```bash
DASHBOARD_DATA_MODE=fixture npm start
DASHBOARD_DATA_MODE=live npm start
```

## API surface

- `GET /api/overview`
- `GET /api/overview/core`
- `GET /api/overview/extended`
- `GET /api/services`
- `GET /api/media`
- `POST /api/media/providers/:provider/login`
- `GET /api/proxy`
- `GET /api/storage`
- `GET /api/network`
- `GET /api/dns`
- `GET /api/maintenance`
- `GET /api/logs/summary`
- `GET /api/actions`
- `POST /api/actions/:id`
- `GET /api/policy`
- `POST /api/policy/actions/:id`
- `GET /api/policy/inspect/:id`

## Layout

- `src/config`: topology, timers, mounts, actions, runtime settings
- `src/collectors`: live or fixture-backed domain collectors
- `src/services`: cache and aggregation layer
- `src/routes`: Express API router
- `public/`: static dashboard UI

## NGINX setup

The dashboard is expected to be served under `/dashboard/`, with static assets handled by NGINX and API requests proxied to the backend on `127.0.0.1:4000`.

Example:

```nginx
location = /dashboard { return 301 /dashboard/; }

location = /dashboard/index.html {
    alias /home/~/PiDashboard/public/index.html;
    add_header Cache-Control "no-store, must-revalidate" always;
}

location /dashboard/ {
    alias /home/~/PiDashboard/public/;
    index index.html;
    try_files $uri $uri/ /dashboard/index.html;
    expires 1h;
}

location /dashboard/api/ {
    proxy_pass http://127.0.0.1:4000/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## Notes

- The backend stays PM2-friendly and does not require a frontend build step.
- The overview page renders critical state first from `/api/overview/core` and fills heavier summaries from `/api/overview/extended`.
- The Policy page is process-managed by design; it prefers PM2/runtime health, safe actions, and on-demand inspection output over passive HTTP probing.
- Static assets must live directly in `/home/~/PiDashboard/public/` as `index.html`, `app.js`, and `style.css`.
- Admin actions that rely on `sudo` will only succeed if the service user has the required non-interactive permissions.
- Pi-hole API integration is optional. Set `PIHOLE_API_URL` and `PIHOLE_API_TOKEN` if you want live query/block metrics from the local API.

## Media status deployment

The browser never invokes rclone and the dashboard user receives no generic sudo rule. The root-owned collector in `deploy/pi-dashboard-cloud-status` runs only after the existing `rclone-pool-health.service`, sanitizes rclone output down to quota fields and safe error classes, and atomically writes `/var/lib/pi-dashboard/cloud-status.json` for the dashboard to read.

Before installing, copy `deploy/cloud-status.conf.example` to `/etc/pi-dashboard/cloud-status.conf`, adjust only the paths for the existing encrypted rclone configuration, provider list, and password helper, and set it to `root:root 0600`. The file contains paths, not credentials. Then run from the repository root:

```bash
sudo ./deploy/install-media-status.sh
sudo systemctl cat rclone-pool-health.service
sudo systemctl start rclone-pool-health.service
sudo systemctl status rclone-pool-health.service rclone-pool-health.timer
sudo -u luke test -r /var/lib/pi-dashboard/cloud-status.json
npm test
npm run lint
pm2 restart pi-dashboard
nginx -t
```

The provider-add workflow is: add the validated remote to the existing encrypted rclone configuration, add its identifier to `providers.list`, then run the required pool health check. Only that completed workflow publishes the provider to the dashboard. Removing a provider from the registry removes its active card after the next check; its reminder history is archived in `provider-reminders.json`.

Configuration paths can be adjusted with `MEDIA_VAULT_MAPPER`, `MEDIA_VAULT_MARKER`, `MEDIA_VAULT_MOUNT`, `MEDIA_POOL_MOUNT`, `MEDIA_OCEAN_MOUNT`, `MEDIA_REQUIRED_PATHS`, `JELLYFIN_TRANSCODE_PATH`, `CLOUD_STATUS_CACHE`, and `PROVIDER_REMINDER_STATE`. No variable accepts credential material.

### Backup and rollback

Before deployment, record the current revision and copy these files to a root-only backup directory: `/var/lib/pi-dashboard/cloud-status.json`, `/var/lib/pi-dashboard/provider-reminders.json`, and any existing `/etc/systemd/system/rclone-pool-health.service.d/20-pi-dashboard-cloud-status.conf`. Verify the current NGINX LAN-only rules with `nginx -T`; this upgrade does not alter them.

To roll back, restore the previous repository revision and backed-up drop-in (or remove only the new drop-in if none existed), remove `/usr/local/libexec/pi-dashboard-cloud-status`, run `systemctl daemon-reload`, and restart only `pi-dashboard` in PM2. Keep a separate copy of `provider-reminders.json` and restore it after any later re-deployment so login history is not lost. The quota cache may be removed because the next successful scheduled health check recreates it.

All dashboard POST routes require an exact same-origin `Origin` header in addition to the existing LAN-only NGINX boundary. Cloud percentages are informational and never change overall health.
