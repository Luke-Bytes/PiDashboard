const state = {
    overviewCore: null,
    overviewExtended: null,
    services: null,
    proxy: null,
    storage: null,
    network: null,
    dns: null,
    maintenance: null,
    logs: null,
    actions: null,
    policy: null,
    policyInspect: null,
    activePage: 'overview',
};

const apiBase = window.location.pathname.includes('/dashboard/') ? '/dashboard/api' : '/api';

const endpoints = {
    overviewCore: `${apiBase}/overview/core`,
    overviewExtended: `${apiBase}/overview/extended`,
    services: `${apiBase}/services`,
    proxy: `${apiBase}/proxy`,
    storage: `${apiBase}/storage`,
    network: `${apiBase}/network`,
    dns: `${apiBase}/dns`,
    maintenance: `${apiBase}/maintenance`,
    logs: `${apiBase}/logs/summary`,
    actions: `${apiBase}/actions`,
    policy: `${apiBase}/policy`,
};

const pageLoaders = {
    overview: async () => {
        if (!state.overviewCore) {
            state.overviewCore = await fetchJson(endpoints.overviewCore);
            renderOverviewCore();
        }
        fetchOverviewExtended().catch(showGlobalError);
    },
    policy: async () => {
        if (!state.policy) {
            state.policy = await fetchJson(endpoints.policy);
            renderPolicy();
        }
    },
    services: async () => {
        if (!state.services) {
            state.services = await fetchJson(endpoints.services);
            renderServices();
        }
    },
    proxy: async () => {
        if (!state.proxy) {
            state.proxy = await fetchJson(endpoints.proxy);
            renderProxy();
        }
    },
    storage: async () => {
        if (!state.storage) {
            state.storage = await fetchJson(endpoints.storage);
            renderStorage();
        }
    },
    network: async () => {
        if (!state.network) {
            state.network = await fetchJson(endpoints.network);
            renderNetwork();
        }
    },
    dns: async () => {
        if (!state.dns || !state.maintenance) {
            const [dns, maintenance] = await Promise.all([
                state.dns ? Promise.resolve(state.dns) : fetchJson(endpoints.dns),
                state.maintenance ? Promise.resolve(state.maintenance) : fetchJson(endpoints.maintenance),
            ]);
            state.dns = dns;
            state.maintenance = maintenance;
            renderDns();
        }
    },
    events: async () => {
        if (!state.logs) {
            state.logs = await fetchJson(endpoints.logs);
            renderEvents();
        }
    },
    actions: async () => {
        if (!state.actions) {
            state.actions = await fetchJson(endpoints.actions);
            renderActions();
        }
    },
};

function setHtml(id, html) {
    const node = document.getElementById(id);
    if (node) node.innerHTML = html;
}

function setText(id, text) {
    const node = document.getElementById(id);
    if (node) node.textContent = text;
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
    return Number.isNaN(date.getTime()) ? String(ts) : date.toLocaleString();
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
    setHtml(targetId, header + (rows.length ? rows.join('') : `<div class="empty-state">No data available.</div>`));
}

function buildOverviewBrief() {
    const core = state.overviewCore;
    const extended = state.overviewExtended;
    if (!core) return 'Overview data not loaded.';
    const s = core.summary;
    return [
        '# Pi Dashboard Overview Brief',
        '',
        `Generated: ${new Date().toLocaleString()}`,
        '',
        '## System',
        `- Host: ${s.hostname}`,
        `- Uptime: ${formatDuration(s.uptimeSeconds)}`,
        `- CPU: ${s.cpuLoadPct}% on ${s.cpuModel}`,
        `- Memory: ${s.memoryUsedGiB}/${s.memoryTotalGiB} GiB`,
        `- Temperature: ${s.temperatureC ?? '—'} C`,
        '',
        '## Alerts',
        ...(core.alerts?.length ? core.alerts.map(alert => `- [${alert.level}] ${alert.title}: ${alert.detail}`) : ['- None']),
        '',
        '## Storage',
        ...(core.storage?.mounts || []).map(mount => `- ${mount.label}: ${mount.usedPct}% used (${mount.freeGiB} GiB free)`),
        '',
        '## DNS',
        `- FTL: ${core.dns?.ftlState || 'unknown'}`,
        `- Unbound: ${core.dns?.unboundState || 'unknown'}`,
        `- Query rate: ${core.dns?.queryRatePerMinute ?? '—'} qpm`,
        '',
        '## Network',
        ...(core.network?.interfaces || []).map(iface => `- ${iface.label}: ${iface.state} ${iface.address} (${iface.role})`),
        '',
        '## Proxy',
        ...(extended?.proxy?.routes || []).map(route => `- ${route.label}: ${route.healthMode === 'process' ? 'process-managed' : route.severity} -> ${route.target}`),
        '',
        '## Recent Noise',
        ...((extended?.recentEvents || core.recentEvents || []).slice(0, 6).map(event => `- [${event.level}] ${event.source}: ${event.message}`)),
    ].join('\n');
}

function buildPolicyBrief() {
    const policy = state.policy;
    if (!policy) return 'Policy data not loaded.';
    const runtime = policy.runtime;
    return [
        '# Policy Service Brief',
        '',
        `Generated: ${new Date().toLocaleString()}`,
        '',
        '## Runtime',
        `- State: ${runtime.state}`,
        `- Severity: ${runtime.severity}`,
        `- Health mode: ${runtime.healthMode}`,
        `- Uptime: ${formatDuration(runtime.uptimeSeconds)}`,
        `- Restarts: ${runtime.restarts}`,
        `- Memory: ${runtime.memoryMiB} MiB`,
        `- CPU: ${runtime.cpuPct}%`,
        `- Port: ${runtime.port ?? '—'}`,
        `- Proxy host: ${runtime.proxyHost || '—'}`,
        `- CWD: ${runtime.cwd || '—'}`,
        '',
        '## Notes',
        ...(runtime.notes?.map(note => `- ${note}`) || ['- None']),
        '',
        '## Recent Logs',
        ...((policy.logs || []).slice(0, 6).map(log => `- ${log.source}: ${log.message}`)),
    ].join('\n');
}

async function copyText(text, label) {
    try {
        await navigator.clipboard.writeText(text);
        setText('actionOutput', `${label} copied to clipboard.`);
    } catch (error) {
        setText('actionOutput', `Clipboard copy failed: ${error.message}`);
    }
}

function showGlobalError(error) {
    setText('actionOutput', error.message || String(error));
}

function renderOverviewCore() {
    const overview = state.overviewCore;
    if (!overview) return;

    const summary = overview.summary;
    const globalSeverity = overview.alerts.some(alert => alert.level === 'critical')
        ? 'critical'
        : overview.alerts.some(alert => alert.level === 'warning')
            ? 'warning'
            : 'healthy';
    const statusNode = document.getElementById('globalStatus');
    statusNode.className = `status-pill ${globalSeverity}`;
    statusNode.textContent = globalSeverity === 'healthy' ? 'Healthy' : globalSeverity;

    setText('dataMode', overview.meta?.dataMode || 'unknown');
    setText('lastUpdated', `Updated ${new Date(overview.generatedAt).toLocaleTimeString()}`);

    setHtml('summaryMetrics', [
        metric('Host', summary.hostname, summary.platform),
        metric('Root SSD', formatPercent(summary.rootUsedPct), `${formatGiB(summary.rootFreeGiB)} free`),
        metric('DNS Stack', summary.dnsHealthy ? 'Healthy' : 'Degraded', `Pi-hole ${summary.queryRatePerMinute || '—'}/min`),
        metric('Memory', `${summary.memoryUsedGiB}/${summary.memoryTotalGiB} GiB`, `zram ${summary.zramSwapUsedGiB}/${summary.zramSwapGiB} GiB`),
        metric('Temperature', summary.temperatureC == null ? '—' : `${summary.temperatureC} °C`, `Throttled ${summary.throttledHex || 'n/a'}`),
        metric('CPU', `${summary.cpuLoadPct}%`, `${summary.cpuModel} • ${summary.cpuCores} cores`),
        metric('Uptime', formatDuration(summary.uptimeSeconds), `Kernel ${summary.kernel}`),
        metric('VPN', summary.vpnHealthy ? 'Healthy' : 'Degraded', 'Critical interface summary'),
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

    setHtml('proxySummary', `<div class="empty-state">Loading deferred proxy summary…</div>`);
    setHtml('maintenanceSummary', `<div class="empty-state">Loading maintenance summary…</div>`);

    document.getElementById('copyOverviewBrief').onclick = () => copyText(buildOverviewBrief(), 'Overview brief');
}

function renderOverviewExtended() {
    const extended = state.overviewExtended;
    if (!extended) return;

    setHtml('proxySummary', renderList(extended.proxy.routes, route => `
        <div class="list-item">
            <div class="list-top">
                <div class="list-title">${route.label}</div>
                ${badge(route.healthMode === 'process' ? 'process' : route.severity, route.healthMode === 'process' ? 'inactive' : route.severity)}
            </div>
            <div class="list-meta mono">${route.host}${route.publicPath} → ${route.target}</div>
            ${route.notes ? `<div class="list-meta">${route.notes}</div>` : ''}
        </div>
    `));

    setHtml('maintenanceSummary', renderList(extended.maintenance.timers, timer => `
        <div class="list-item">
            <div class="list-top">
                <div class="list-title">${timer.label || timer.name}</div>
                ${badge(timer.state, timer.state === 'waiting' ? 'healthy' : 'warning')}
            </div>
            <div class="list-meta mono">${timer.lastRun || '—'} → ${timer.nextRun || '—'}</div>
        </div>
    `));
}

async function fetchOverviewExtended(force = false) {
    if (!force && state.overviewExtended) return;
    state.overviewExtended = await fetchJson(endpoints.overviewExtended);
    renderOverviewExtended();
}

function renderServices() {
    const services = state.services;
    if (!services) return;
    renderTable('systemdTable', ['Service', 'State', 'Subtype', 'Role', 'Critical'], services.systemd.map(service => `
        <div class="table-row">
            <div><div class="list-title">${service.label}</div><div class="list-meta mono">${service.name}</div></div>
            <div>${badge(service.state, service.severity)}</div>
            <div class="mono">${service.subState || '—'}</div>
            <div>${service.category || 'system'}</div>
            <div>${service.critical ? 'Yes' : 'No'}</div>
        </div>
    `));
    renderTable('pm2Table', ['App', 'State', 'Restarts', 'Memory', 'Route'], services.pm2.map(app => `
        <div class="table-row">
            <div><div class="list-title">${app.label || app.name}</div><div class="list-meta mono">${app.cwd || app.name}</div></div>
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
    renderTable('proxyTable', ['Route', 'Public URL', 'Upstream', 'Mode', 'Status'], proxy.routes.map(route => `
        <div class="table-row wide">
            <div><div class="list-title">${route.label}</div><div class="list-meta mono">${route.host}${route.publicPath}</div></div>
            <div class="mono">${route.publicUrl || `${route.host}${route.publicPath}`}</div>
            <div class="mono">${route.target}</div>
            <div>${route.healthMode === 'process' ? 'process' : 'http'}</div>
            <div>${route.probe ? badge(route.probe.ok ? route.probe.status : 'fail', route.severity) : badge(route.healthMode === 'process' ? 'process' : 'static', route.healthMode === 'process' ? 'inactive' : 'healthy')}</div>
        </div>
    `));
}

function renderStorage() {
    const storage = state.storage;
    if (!storage) return;
    renderTable('storageTable', ['Mount', 'Used', 'Free', 'Filesystem', 'State'], storage.mounts.map(mount => `
        <div class="table-row">
            <div><div class="list-title">${mount.label}</div><div class="list-meta mono">${mount.mount} • ${mount.source}</div></div>
            <div class="mono">${mount.usedGiB}/${mount.totalGiB} GiB</div>
            <div class="mono">${mount.freeGiB} GiB</div>
            <div class="mono">${mount.fsType}</div>
            <div>${badge(`${mount.usedPct}%`, mount.severity)}</div>
        </div>
    `));
    setHtml('topConsumers', renderList(storage.topConsumers, item => `
        <div class="list-item">
            <div class="list-top"><div class="list-title mono">${item.path}</div>${badge(`${item.usedGiB} GiB`, 'warning')}</div>
        </div>
    `, 'Top-consumer scan unavailable in current mode.'));
}

function renderNetwork() {
    const network = state.network;
    if (!network) return;
    renderTable('networkTable', ['Interface', 'State', 'Address', 'Traffic', 'Role'], network.interfaces.map(iface => `
        <div class="table-row">
            <div><div class="list-title">${iface.label}</div><div class="list-meta mono">${iface.name}</div></div>
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
    if (!state.dns || !state.maintenance) return;
    const dns = state.dns;
    const maintenance = state.maintenance;
    setHtml('dnsDetails', `
        <div class="list-item">
            <div class="list-top"><div class="list-title">Pi-hole</div>${badge(dns.piholeEnabled === false ? 'disabled' : 'enabled', dns.piholeEnabled === false ? 'warning' : 'healthy')}</div>
            <div class="list-meta">FTL ${dns.ftlState} • Unbound ${dns.unboundState}</div>
        </div>
        <div class="list-item">
            <div class="list-top"><div class="list-title">Query profile</div>${badge(`${dns.queryRatePerMinute ?? '—'} qpm`, 'healthy')}</div>
            <div class="list-meta">Blocked ${dns.blockedPct ?? '—'}% • 24h total ${dns.queryTotal24h ?? '—'} • Latency ${dns.latencyMs ?? '—'} ms</div>
        </div>
        <div class="list-item">
            <div class="list-top"><div class="list-title">Listeners</div>${badge('Active', 'healthy')}</div>
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
            <button data-global-action="${action.id}">${action.confirmation ? 'Run with confirmation' : 'Run action'}</button>
        </div>
    `, 'No actions available.'));

    document.querySelectorAll('[data-global-action]').forEach(button => {
        button.onclick = async () => {
            const actionId = button.getAttribute('data-global-action');
            const action = actions.find(item => item.id === actionId);
            if (action?.confirmation && !window.confirm(`Run "${action.label}"?`)) return;
            button.disabled = true;
            try {
                const result = await postJson(`${apiBase}/actions/${actionId}`);
                document.getElementById('actionOutput').textContent = JSON.stringify(result, null, 2);
                invalidateAll();
                await loadPage(state.activePage);
            } catch (error) {
                showGlobalError(error);
            } finally {
                button.disabled = false;
            }
        };
    });
}

function renderPolicy() {
    const policy = state.policy;
    if (!policy) return;
    const runtime = policy.runtime;
    const pill = document.getElementById('policyStatus');
    pill.className = `status-pill ${severityClass(runtime.severity)}`;
    pill.textContent = runtime.severity;

    setHtml('policyRuntime', `
        <div class="stats-grid two-up">
            ${metric('State', runtime.state, `Health mode ${runtime.healthMode}`)}
            ${metric('Uptime', formatDuration(runtime.uptimeSeconds), `${runtime.restarts} restarts`)}
            ${metric('Memory', `${runtime.memoryMiB} MiB`, `CPU ${runtime.cpuPct}%`)}
            ${metric('Binding', runtime.port ? `:${runtime.port}` : '—', runtime.proxyHost || 'No proxy host')}
        </div>
        <div class="stack compact">
            ${(runtime.notes || []).map(note => `<div class="list-item"><div class="list-meta">${note}</div></div>`).join('')}
        </div>
    `);

    setHtml('policyActions', renderList(policy.actions, action => `
        <div class="action-item">
            <div class="list-title">${action.label}</div>
            <div class="list-meta">${action.description}</div>
            <button data-policy-action="${action.id}">${action.confirmation ? 'Run with confirmation' : 'Run action'}</button>
        </div>
    `));

    setHtml('policyReports', renderList(policy.reports, report => `
        <div class="action-item">
            <div class="list-title">${report.label}</div>
            <div class="list-meta">${report.description}</div>
            <button data-policy-report="${report.id}">Run report</button>
        </div>
    `));

    setHtml('policyLogs', renderList(policy.logs, log => `
        <div class="event-item">
            <div class="list-top">
                <div class="list-title">${log.source}</div>
                ${badge(log.level, log.level === 'info' ? 'healthy' : log.level)}
            </div>
            <div class="list-meta">${log.message}</div>
        </div>
    `, 'No recent Policy logs.'));

    document.getElementById('copyPolicyBrief').onclick = () => copyText(buildPolicyBrief(), 'Policy brief');

    document.querySelectorAll('[data-policy-action]').forEach(button => {
        button.onclick = async () => {
            const id = button.getAttribute('data-policy-action');
            const action = policy.actions.find(item => item.id === id);
            if (action?.confirmation && !window.confirm(`Run "${action.label}"?`)) return;
            button.disabled = true;
            try {
                const result = await postJson(`${apiBase}/policy/actions/${id}`);
                document.getElementById('policyActionOutput').textContent = JSON.stringify(result, null, 2);
                state.policy = null;
                await loadPage('policy', true);
            } catch (error) {
                document.getElementById('policyActionOutput').textContent = error.message;
            } finally {
                button.disabled = false;
            }
        };
    });

    document.querySelectorAll('[data-policy-report]').forEach(button => {
        button.onclick = async () => {
            const id = button.getAttribute('data-policy-report');
            button.disabled = true;
            try {
                const result = await fetchJson(`${apiBase}/policy/inspect/${id}`);
                state.policyInspect = result;
                renderPolicyInspect();
            } catch (error) {
                document.getElementById('policyStructuredOutput').textContent = error.message;
            } finally {
                button.disabled = false;
            }
        };
    });

    renderPolicyInspect();
}

function renderPolicyInspect() {
    const inspect = state.policyInspect;
    if (!inspect) {
        document.getElementById('policyStructuredOutput').textContent = 'Run a report to generate a structured brief.';
        document.getElementById('policyRawOutput').textContent = 'Run a report to capture raw output.';
        document.getElementById('copyPolicyStructured').onclick = null;
        document.getElementById('copyPolicyRaw').onclick = null;
        return;
    }

    document.getElementById('policyStructuredOutput').textContent = inspect.structuredText;
    document.getElementById('policyRawOutput').textContent = inspect.rawText;
    document.getElementById('copyPolicyStructured').onclick = () => copyText(inspect.structuredText, 'Policy structured brief');
    document.getElementById('copyPolicyRaw').onclick = () => copyText(inspect.rawText, 'Policy raw output');
}

async function fetchJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return response.json();
}

async function postJson(url) {
    const response = await fetch(url, { method: 'POST' });
    if (!response.ok) throw new Error(`${url} returned ${response.status}`);
    return response.json();
}

function invalidateAll() {
    state.overviewCore = null;
    state.overviewExtended = null;
    state.services = null;
    state.proxy = null;
    state.storage = null;
    state.network = null;
    state.dns = null;
    state.maintenance = null;
    state.logs = null;
    state.actions = null;
}

async function loadPage(page, force = false) {
    state.activePage = page;
    if (force) {
        if (page === 'overview') {
            state.overviewCore = null;
            state.overviewExtended = null;
        } else if (page === 'policy') {
            state.policy = null;
        } else if (page === 'events') {
            state.logs = null;
        } else if (page === 'actions') {
            state.actions = null;
        } else {
            state[page] = null;
        }
    }

    const loader = pageLoaders[page];
    if (loader) await loader();
}

function bindNavigation() {
    document.querySelectorAll('.nav-link').forEach(button => {
        button.addEventListener('click', async () => {
            const target = button.getAttribute('data-target');
            document.querySelectorAll('.nav-link').forEach(item => item.classList.toggle('active', item === button));
            document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.id === `page-${target}`));
            try {
                await loadPage(target);
            } catch (error) {
                showGlobalError(error);
            }
        });
    });
}

async function refreshVisiblePage() {
    try {
        await loadPage(state.activePage, true);
    } catch (error) {
        showGlobalError(error);
    }
}

async function boot() {
    bindNavigation();
    try {
        state.actions = await fetchJson(endpoints.actions);
        renderActions();
        await loadPage('overview');
    } catch (error) {
        showGlobalError(error);
    }

    setInterval(refreshVisiblePage, 10000);
}

boot();
