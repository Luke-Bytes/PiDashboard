const state = {
    overview: null,
    services: null,
    proxy: null,
    storage: null,
    network: null,
    dns: null,
    maintenance: null,
    logs: null,
    actions: null,
};

const apiBase = window.location.pathname.includes('/dashboard/') ? '/dashboard/api' : '/api';

const endpoints = {
    overview: `${apiBase}/overview`,
    services: `${apiBase}/services`,
    proxy: `${apiBase}/proxy`,
    storage: `${apiBase}/storage`,
    network: `${apiBase}/network`,
    dns: `${apiBase}/dns`,
    maintenance: `${apiBase}/maintenance`,
    logs: `${apiBase}/logs/summary`,
    actions: `${apiBase}/actions`,
};

function setHtml(id, html) {
    const node = document.getElementById(id);
    if (node) node.innerHTML = html;
}

function severityClass(severity) {
    return severity || 'inactive';
}

function badge(text, severity = 'inactive') {
    return `<span class="badge ${severityClass(severity)}">${text}</span>`;
}

function formatPercent(value) {
    return value == null ? '—' : `${value}%`;
}

function formatGiB(value) {
    return value == null ? '—' : `${value} GiB`;
}

function formatTime(ts) {
    if (!ts) return '—';
    const date = new Date(ts);
    if (Number.isNaN(date.getTime())) return ts;
    return date.toLocaleString();
}

function formatDuration(seconds) {
    if (!seconds) return '—';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function renderSummary() {
    const overview = state.overview;
    if (!overview) return;
    const s = overview.summary;
    const globalSeverity = overview.alerts.some(alert => alert.level === 'critical')
        ? 'critical'
        : overview.alerts.some(alert => alert.level === 'warning')
            ? 'warning'
            : 'healthy';
    const statusNode = document.getElementById('globalStatus');
    statusNode.className = `status-pill ${globalSeverity}`;
    statusNode.textContent = globalSeverity === 'healthy' ? 'Healthy' : globalSeverity;

    document.getElementById('dataMode').textContent = overview.meta?.dataMode || 'unknown';
    document.getElementById('lastUpdated').textContent = `Updated ${new Date(overview.generatedAt).toLocaleTimeString()}`;

    setHtml('summaryMetrics', [
        metric('Host', s.hostname, s.platform),
        metric('Root SSD', formatPercent(s.rootUsedPct), `${formatGiB(s.rootFreeGiB)} free`),
        metric('DNS Stack', s.dnsHealthy ? 'Healthy' : 'Degraded', `Pi-hole ${s.queryRatePerMinute || '—'}/min`),
        metric('Proxy', s.proxyHealthy ? 'Healthy' : 'Degraded', `${overview.proxy.degraded} degraded routes`),
        metric('Memory', `${s.memoryUsedGiB}/${s.memoryTotalGiB} GiB`, `zram ${s.zramSwapUsedGiB}/${s.zramSwapGiB} GiB`),
        metric('Temperature', s.temperatureC == null ? '—' : `${s.temperatureC} °C`, `Throttled ${s.throttledHex || 'n/a'}`),
        metric('CPU', `${s.cpuLoadPct}%`, `${s.cpuModel} • ${s.cpuCores} cores`),
        metric('Uptime', formatDuration(s.uptimeSeconds), `Kernel ${s.kernel}`),
    ].join(''));

    setHtml('alertsList', renderList(overview.alerts, alert => `
        <div class="list-item">
            <div class="list-top">
                <div class="list-title">${alert.title}</div>
                ${badge(alert.level, alert.level)}
            </div>
            <div class="list-meta">${alert.detail}</div>
        </div>
    `, 'No critical alerts.'));

    setHtml('serviceMatrix', renderList(overview.serviceMatrix, item => `
        <div class="list-item">
            <div class="list-top">
                <div class="list-title">${item.label}</div>
                ${badge(item.state, item.severity)}
            </div>
            <div class="list-meta mono">${item.kind} • ${item.name}</div>
        </div>
    `));

    setHtml('proxySummary', renderList(overview.proxy.routes, route => `
        <div class="list-item">
            <div class="list-top">
                <div class="list-title">${route.label}</div>
                ${badge(route.severity, route.severity)}
            </div>
            <div class="list-meta mono">${route.host}${route.publicPath} → ${route.target}</div>
        </div>
    `));

    setHtml('storageSummary', renderList(overview.storage.mounts, mount => `
        <div class="list-item">
            <div class="list-top">
                <div class="list-title">${mount.label}</div>
                ${badge(`${mount.usedPct}%`, mount.severity)}
            </div>
            <div class="list-meta mono">${mount.mount} • ${mount.usedGiB}/${mount.totalGiB} GiB</div>
        </div>
    `));

    setHtml('dnsSummary', `
        <div class="list-item">
            <div class="list-top">
                <div class="list-title">Pi-hole FTL</div>
                ${badge(overview.dns.ftlState || 'unknown', overview.dns.severity)}
            </div>
            <div class="list-meta">Blocked ${overview.dns.blockedPct ?? '—'}% • ${overview.dns.queryRatePerMinute ?? '—'} qpm • ${overview.dns.latencyMs ?? '—'} ms</div>
        </div>
        <div class="list-item">
            <div class="list-top">
                <div class="list-title">Unbound</div>
                ${badge(overview.dns.unboundState || 'unknown', overview.dns.severity)}
            </div>
            <div class="list-meta mono">${(overview.dns.listeners || []).join(' • ') || 'No listener data'}</div>
        </div>
    `);

    setHtml('networkSummary', renderList(overview.network.interfaces, iface => `
        <div class="list-item">
            <div class="list-top">
                <div class="list-title">${iface.label}</div>
                ${badge(iface.state, iface.severity)}
            </div>
            <div class="list-meta mono">${iface.address} • ${iface.role}</div>
        </div>
    `));

    setHtml('eventsSummary', renderList(overview.recentEvents, event => `
        <div class="event-item">
            <div class="list-top">
                <div class="list-title">${event.source}</div>
                ${badge(event.level, event.level === 'info' ? 'healthy' : event.level)}
            </div>
            <div class="list-meta">${event.message}</div>
        </div>
    `, 'No recent warnings or restarts.'));
}

function metric(label, value, detail) {
    return `
        <div class="stat">
            <div class="metric-label">${label}</div>
            <div class="metric-value">${value}</div>
            <div class="metric-detail">${detail}</div>
        </div>
    `;
}

function renderList(items, renderer, emptyText = 'No data available.') {
    if (!items || items.length === 0) return `<div class="empty-state">${emptyText}</div>`;
    return items.map(renderer).join('');
}

function renderTable(targetId, columns, rows, type = '') {
    const header = `
        <div class="table-row table-head ${type}">
            ${columns.map(column => `<div>${column}</div>`).join('')}
        </div>
    `;
    const body = rows.length
        ? rows.join('')
        : `<div class="empty-state">No data available.</div>`;
    setHtml(targetId, header + body);
}

function renderServices() {
    const services = state.services;
    if (!services) return;

    renderTable('systemdTable', ['Service', 'State', 'Subtype', 'Role', 'Critical'], services.systemd.map(service => `
        <div class="table-row">
            <div>
                <div class="list-title">${service.label}</div>
                <div class="list-meta mono">${service.name}</div>
            </div>
            <div>${badge(service.state, service.severity)}</div>
            <div class="mono">${service.subState || '—'}</div>
            <div>${service.category || 'system'}</div>
            <div>${service.critical ? 'Yes' : 'No'}</div>
        </div>
    `));

    renderTable('pm2Table', ['App', 'State', 'Restarts', 'Memory', 'Route'], services.pm2.map(app => `
        <div class="table-row">
            <div>
                <div class="list-title">${app.label || app.name}</div>
                <div class="list-meta mono">${app.cwd || app.name}</div>
            </div>
            <div>${badge(app.state, app.severity)}</div>
            <div class="mono">${app.restarts}</div>
            <div class="mono">${app.memoryMiB} MiB</div>
            <div class="mono">${app.proxyPath || app.proxyHost || app.port || '—'}</div>
        </div>
    `));
}

function renderProxy() {
    const proxy = state.proxy;
    if (!proxy) return;
    renderTable('proxyTable', ['Route', 'Public URL', 'Upstream', 'Probe', 'Latency'], proxy.routes.map(route => `
        <div class="table-row wide">
            <div>
                <div class="list-title">${route.label}</div>
                <div class="list-meta mono">${route.host}${route.publicPath}</div>
            </div>
            <div class="mono">${route.publicUrl || `${route.host}${route.publicPath}`}</div>
            <div class="mono">${route.target}</div>
            <div>${route.probe ? badge(route.probe.ok ? route.probe.status : 'fail', route.severity) : badge('static', 'healthy')}</div>
            <div class="mono">${route.probe?.latencyMs ?? '—'} ms</div>
        </div>
    `));
}

function renderStorage() {
    const storage = state.storage;
    if (!storage) return;
    renderTable('storageTable', ['Mount', 'Used', 'Free', 'Filesystem', 'State'], storage.mounts.map(mount => `
        <div class="table-row">
            <div>
                <div class="list-title">${mount.label}</div>
                <div class="list-meta mono">${mount.mount} • ${mount.source}</div>
            </div>
            <div class="mono">${mount.usedGiB}/${mount.totalGiB} GiB</div>
            <div class="mono">${mount.freeGiB} GiB</div>
            <div class="mono">${mount.fsType}</div>
            <div>${badge(`${mount.usedPct}%`, mount.severity)}</div>
        </div>
    `));

    setHtml('topConsumers', renderList(storage.topConsumers, item => `
        <div class="list-item">
            <div class="list-top">
                <div class="list-title mono">${item.path}</div>
                ${badge(`${item.usedGiB} GiB`, 'warning')}
            </div>
        </div>
    `, 'Top-consumer scan unavailable in current mode.'));
}

function renderNetwork() {
    const network = state.network;
    if (!network) return;
    renderTable('networkTable', ['Interface', 'State', 'Address', 'Traffic', 'Role'], network.interfaces.map(iface => `
        <div class="table-row">
            <div>
                <div class="list-title">${iface.label}</div>
                <div class="list-meta mono">${iface.name}</div>
            </div>
            <div>${badge(iface.state, iface.severity)}</div>
            <div class="mono">${iface.address}</div>
            <div class="mono">↓ ${iface.rxMbps} ↑ ${iface.txMbps} MB/s</div>
            <div>${iface.role}</div>
        </div>
    `));

    renderTable('listenersTable', ['Listener', 'Bind', 'Port', 'Exposure', 'Process'], (network.listeners || []).slice(0, 12).map(listener => `
        <div class="table-row">
            <div class="mono">${listener.protocol}</div>
            <div class="mono">${listener.address}</div>
            <div class="mono">${listener.port ?? '—'}</div>
            <div>${listener.exposure}</div>
            <div class="mono">${listener.process}</div>
        </div>
    `), 'compact');
}

function renderDns() {
    const dns = state.dns;
    const maintenance = state.maintenance;
    if (!dns || !maintenance) return;

    setHtml('dnsDetails', `
        <div class="list-item">
            <div class="list-top">
                <div class="list-title">Pi-hole</div>
                ${badge(dns.piholeEnabled === false ? 'disabled' : 'enabled', dns.piholeEnabled === false ? 'warning' : 'healthy')}
            </div>
            <div class="list-meta">FTL ${dns.ftlState} • Unbound ${dns.unboundState}</div>
        </div>
        <div class="list-item">
            <div class="list-top">
                <div class="list-title">Query profile</div>
                ${badge(`${dns.queryRatePerMinute ?? '—'} qpm`, 'healthy')}
            </div>
            <div class="list-meta">Blocked ${dns.blockedPct ?? '—'}% • 24h total ${dns.queryTotal24h ?? '—'} • Latency ${dns.latencyMs ?? '—'} ms</div>
        </div>
        <div class="list-item">
            <div class="list-top">
                <div class="list-title">Listeners</div>
                ${badge('Active', 'healthy')}
            </div>
            <div class="list-meta mono">${(dns.listeners || []).join(' • ') || 'No listener data'}</div>
        </div>
    `);

    renderTable('maintenanceTable', ['Timer', 'State', 'Last run', 'Next run', 'Unit'], maintenance.timers.map(timer => `
        <div class="table-row">
            <div>${timer.label || timer.name}</div>
            <div>${badge(timer.state, timer.state === 'waiting' ? 'healthy' : 'warning')}</div>
            <div class="mono">${timer.lastRun || '—'}</div>
            <div class="mono">${timer.nextRun || '—'}</div>
            <div class="mono">${timer.name}</div>
        </div>
    `));
}

function renderEvents() {
    const logs = state.logs;
    if (!logs) return;
    renderTable('eventsTable', ['Time', 'Source', 'Level', 'Message', ''], logs.events.map(event => `
        <div class="table-row wide">
            <div class="mono">${formatTime(event.ts)}</div>
            <div class="mono">${event.source}</div>
            <div>${badge(event.level, event.level === 'info' ? 'healthy' : event.level)}</div>
            <div>${event.message}</div>
            <div></div>
        </div>
    `));
}

function renderActions() {
    const actions = state.actions?.actions || [];
    setHtml('actionsList', renderList(actions, action => `
        <div class="action-item">
            <div class="list-title">${action.label}</div>
            <div class="list-meta">${action.description}</div>
            <button data-action="${action.id}">${action.confirmation ? 'Run with confirmation' : 'Run action'}</button>
        </div>
    `, 'No actions available.'));

    document.querySelectorAll('[data-action]').forEach(button => {
        button.onclick = async () => {
            const actionId = button.getAttribute('data-action');
            const action = actions.find(item => item.id === actionId);
            if (action?.confirmation && !window.confirm(`Run "${action.label}"?`)) return;
            button.disabled = true;
            try {
                const response = await fetch(`${apiBase}/actions/${actionId}`, { method: 'POST' });
                const result = await response.json();
                document.getElementById('actionOutput').textContent = JSON.stringify(result, null, 2);
                await refreshAll();
            } catch (error) {
                document.getElementById('actionOutput').textContent = error.message;
            } finally {
                button.disabled = false;
            }
        };
    });
}

async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
        throw new Error(`${url} returned ${response.status}`);
    }
    return response.json();
}

async function refreshAll() {
    const [
        overview,
        services,
        proxy,
        storage,
        network,
        dns,
        maintenance,
        logs,
        actions,
    ] = await Promise.all([
        fetchJson(endpoints.overview),
        fetchJson(endpoints.services),
        fetchJson(endpoints.proxy),
        fetchJson(endpoints.storage),
        fetchJson(endpoints.network),
        fetchJson(endpoints.dns),
        fetchJson(endpoints.maintenance),
        fetchJson(endpoints.logs),
        fetchJson(endpoints.actions),
    ]);

    Object.assign(state, { overview, services, proxy, storage, network, dns, maintenance, logs, actions });

    renderSummary();
    renderServices();
    renderProxy();
    renderStorage();
    renderNetwork();
    renderDns();
    renderEvents();
    renderActions();
}

function bindNavigation() {
    document.querySelectorAll('.nav-link').forEach(button => {
        button.addEventListener('click', () => {
            const target = button.getAttribute('data-target');
            document.querySelectorAll('.nav-link').forEach(item => item.classList.toggle('active', item === button));
            document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.id === `page-${target}`));
        });
    });
}

async function boot() {
    bindNavigation();
    try {
        await refreshAll();
    } catch (error) {
        document.getElementById('actionOutput').textContent = `Initial load failed: ${error.message}`;
    }
    setInterval(async () => {
        try {
            await refreshAll();
        } catch (error) {
            document.getElementById('actionOutput').textContent = `Refresh failed: ${error.message}`;
        }
    }, 10000);
}

boot();
