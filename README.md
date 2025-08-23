# PiDashboard

A simple HTML dashboard for monitoring Raspberry Pi system vitals.  
The backend is a small Express.js API that provides system information.

## Running

Install dependencies and start:

```bash
npm install
npm run start:pm2
```

## Nginx setup

PiDashboard is expected to be served under /dashboard/.
Static files come from the public/ directory, and API calls are proxied to the Node server.

Example:
```nginx
location /dashboard/ {
root /path/to/project/public;
index index.html;
try_files $uri /index.html;
}

location /dashboard/api/ {
proxy_pass http://127.0.0.1:4000/dashboard/api/;
}
```