# PiDashboard

An operational dashboard for a real Raspberry Pi admin environment. It focuses on service health, reverse-proxy topology, storage pressure, DNS state, PM2 apps, maintenance timers, and safe admin actions.

## Running

```bash
npm install
npm start
```

For local development away from the Pi, the dashboard defaults to fixture data on non-Linux hosts. You can force a mode with:

```bash
DASHBOARD_DATA_MODE=fixture npm start
DASHBOARD_DATA_MODE=live npm start
```

## API surface

- `GET /api/overview`
- `GET /api/overview/core`
- `GET /api/overview/extended`
- `GET /api/services`
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
