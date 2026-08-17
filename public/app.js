const state = {
    overviewCore: null, overviewExtended: null, media: null, services: null, proxy: null,
    storage: null, network: null, dns: null, maintenance: null, logs: null, actions: null,
    policy: null, policyInspect: null, activePage: 'overview', refreshing: false,
};

const apiBase = window.location.pathname.includes('/dashboard/') ? '/dashboard/api' : '/api';
const endpoints = Object.fromEntries(Object.entries({
    overviewCore: 'overview/core', overviewExtended: 'overview/extended', media: 'media', services: 'services',
    proxy: 'proxy', storage: 'storage', network: 'network', dns: 'dns', maintenance: 'maintenance',
    logs: 'logs/summary', actions: 'actions', policy: 'policy',
}).map(([key, path]) => [key, `${apiBase}/${path}`]));

function esc(value) {
    return String(value ?? '—').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function safeSeverity(value) {
    return ['healthy', 'warning', 'critical', 'inactive'].includes(value) ? value : 'inactive';
}

function setHtml(id, html) { const node = document.getElementById(id); if (node) node.innerHTML = html; }
function setText(id, text) { const node = document.getElementById(id); if (node) node.textContent = text; }
function badge(text, severity = 'inactive') { return `<span class="badge ${safeSeverity(severity)}">${esc(text)}</span>`; }
function formatPercent(value) { return value == null ? '—' : `${value}%`; }
function formatGiB(value) { return value == null ? '—' : `${value} GiB`; }
function formatBytes(value) {
    if (!Number.isFinite(value)) return '—';
    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
    let current = value; let unit = 0;
    while (current >= 1024 && unit < units.length - 1) { current /= 1024; unit += 1; }
    return `${current >= 100 ? current.toFixed(0) : current.toFixed(1)} ${units[unit]}`;
}
function formatTime(value) { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString(); }
function formatDuration(seconds) {
    if (!seconds) return '—'; const days = Math.floor(seconds / 86400); const hours = Math.floor(seconds % 86400 / 3600); const minutes = Math.floor(seconds % 3600 / 60);
    return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}
function metric(label, value, detail = '') {
    return `<div class="stat"><div class="metric-label">${esc(label)}</div><div class="metric-value">${esc(value)}</div><div class="metric-detail">${esc(detail)}</div></div>`;
}
function renderList(items, renderer, empty = 'No data available.') { return items?.length ? items.map(renderer).join('') : `<div class="empty-state">${esc(empty)}</div>`; }
function listItem(title, value, severity, detail = '') {
    return `<div class="list-item"><div class="list-top"><div class="list-title">${esc(title)}</div>${badge(value, severity)}</div>${detail ? `<div class="list-meta">${esc(detail)}</div>` : ''}</div>`;
}
function renderTable(id, columns, rows, type = '') {
    setHtml(id, `<div class="table-row table-head ${esc(type)}">${columns.map(column => `<div>${esc(column)}</div>`).join('')}</div>${rows.length ? rows.join('') : '<div class="empty-state">No data available.</div>'}`);
}
function capacityBar(used, total) {
    const percent = total > 0 && Number.isFinite(used) ? Math.max(0, Math.min(100, used / total * 100)) : 0;
    return `<div class="capacity-bar" role="img" aria-label="${esc(percent.toFixed(1))}% used"><span style="width:${percent.toFixed(1)}%"></span></div>`;
}

async function fetchJson(url) { const response = await fetch(url, { cache: 'no-store' }); if (!response.ok) throw new Error(`${url} returned ${response.status}`); return response.json(); }
async function postJson(url) { const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); if (!response.ok) throw new Error(`${url} returned ${response.status}`); return response.json(); }
async function copyText(text, label) { try { await navigator.clipboard.writeText(text); setText('actionOutput', `${label} copied to clipboard.`); } catch (error) { setText('actionOutput', `Clipboard copy failed: ${error.message}`); } }
function showGlobalError(error) { setText('actionOutput', error.message || String(error)); }

function renderOverview() {
    const overview = state.overviewCore; if (!overview) return;
    const summary = overview.summary || {}; const alerts = overview.alerts || []; const media = state.media;
    const hostCritical = alerts.some(alert => alert.level === 'critical');
    const overall = hostCritical || media?.overall?.severity === 'critical'
        ? { label: 'Degraded', severity: 'critical' }
        : alerts.length || media?.overall?.severity === 'warning'
            ? { label: 'Attention', severity: 'warning' }
            : { label: 'Healthy', severity: 'healthy' };
    const pill = document.getElementById('globalStatus'); pill.className = `status-pill ${safeSeverity(overall.severity)}`; pill.textContent = overall.label;
    setText('dataMode', overview.meta?.dataMode || 'live'); setText('lastUpdated', `Updated ${new Date(overview.generatedAt).toLocaleTimeString()}`);
    setHtml('summaryMetrics', [
        metric('Uptime', formatDuration(summary.uptimeSeconds), `${summary.cpuLoadPct ?? '—'}% CPU load`),
        metric('Temperature', summary.temperatureC == null ? '—' : `${summary.temperatureC} °C`, summary.hostname || 'Host'),
        metric('RAM', `${summary.memoryUsedGiB ?? '—'}/${summary.memoryTotalGiB ?? '—'} GiB`, `zram ${summary.zramSwapUsedGiB ?? '—'}/${summary.zramSwapGiB ?? '—'} GiB`),
        metric('Root', formatPercent(summary.rootUsedPct), `${formatGiB(summary.rootFreeGiB)} free`),
    ].join(''));
    setHtml('alertsList', renderList(alerts, alert => listItem(alert.title, alert.level, alert.level, alert.detail), 'No host alerts.'));
    setHtml('serviceMatrix', renderList(overview.serviceMatrix || [], item => listItem(item.label, item.state, item.severity, `${item.kind} • ${item.name}`)));
    setHtml('storageSummary', renderList(overview.storage?.mounts || [], mount => listItem(mount.label, `${mount.usedPct}%`, mount.severity, `${mount.mount} • ${mount.usedGiB}/${mount.totalGiB} GiB`)));
    setHtml('dnsSummary', listItem('Pi-hole FTL', overview.dns?.ftlState || 'unknown', overview.dns?.severity, `Blocked ${overview.dns?.blockedPct ?? '—'}% • ${overview.dns?.queryRatePerMinute ?? '—'} qpm`) + listItem('Unbound', overview.dns?.unboundState || 'unknown', overview.dns?.severity, (overview.dns?.listeners || []).join(' • ')));
    setHtml('networkSummary', renderList(overview.network?.interfaces || [], item => listItem(item.label, item.state, item.severity, `${item.address} • ${item.role}`)));
    setHtml('eventsSummary', renderList(overview.recentEvents || [], event => listItem(event.source, event.level, event.level === 'info' ? 'healthy' : event.level, event.message), 'No recent warnings.'));
    setHtml('proxySummary', '<div class="empty-state">Loading deferred proxy summary…</div>'); setHtml('maintenanceSummary', '<div class="empty-state">Loading maintenance summary…</div>');
    renderOverviewMedia(); document.getElementById('copyOverviewBrief').onclick = () => copyText(buildOverviewBrief(), 'Overview brief');
}

function renderOverviewMedia() {
    const media = state.media;
    if (!media) { setHtml('overviewMediaCards', '<article class="card"><div class="empty-state">Loading media health…</div></article>'); return; }
    const vaultCapacity = media.capacity?.find(item => item.label === 'Vault'); const nextReminder = [...(media.providers || [])].filter(item => item.reminder?.severity === 'warning').sort((a, b) => (a.reminder.daysUntil ?? -999) - (b.reminder.daysUntil ?? -999))[0];
    const aggregate = media.aggregates || {}; const onlineServices = (media.services || []).filter(item => item.classification === 'Online').length;
    setHtml('overviewMediaCards', [
        metric('Overall', media.overall?.label || 'Unavailable', `${(media.services || []).length} media services`),
        metric('Vault', media.vault?.classification || 'Unavailable', media.vault?.detail || (vaultCapacity?.available === false ? 'Capacity unavailable' : `${formatBytes(vaultCapacity?.freeBytes)} free`)),
        metric('Cloud aggregate', media.cloudCollection?.state === 'not_collected' ? 'Setup required' : formatBytes(aggregate.free), media.cloudError || `${aggregate.partial ? 'Partial • ' : ''}${aggregate.reportedProviders || 0}/${aggregate.totalProviders || 0} reporting`),
        metric('Media', media.media?.label || 'Unavailable', `${onlineServices}/${(media.services || []).length} services online`),
        metric('Weekly health', media.health?.state || 'Unavailable', `Next ${formatTime(media.health?.timer?.nextRun)}`),
        metric('Next login reminder', nextReminder?.id || 'None', nextReminder?.reminder?.label || 'All current'),
    ].map(content => `<article class="card overview-mini">${content}</article>`).join(''));
}

function renderOverviewExtended() {
    const value = state.overviewExtended; if (!value) return;
    setHtml('proxySummary', renderList(value.proxy?.routes || [], route => listItem(route.label, route.healthMode === 'process' ? 'process' : route.severity, route.healthMode === 'process' ? 'inactive' : route.severity, `${route.host}${route.publicPath} → ${route.target}`)));
    setHtml('maintenanceSummary', renderList(value.maintenance?.timers || [], timer => listItem(timer.label || timer.name, timer.state, timer.state === 'waiting' ? 'healthy' : 'warning', `${timer.lastRun || '—'} → ${timer.nextRun || '—'}`)));
}

function renderMedia() {
    const media = state.media; if (!media) return; const overall = media.overall || { label: 'Degraded', severity: 'critical' };
    const pill = document.getElementById('mediaStatus'); pill.className = `status-pill ${safeSeverity(overall.severity)}`; pill.textContent = overall.label;
    const vault = media.vault || {};
    setHtml('vaultLifecycle', listItem('Vault state', vault.classification || 'Unavailable', vault.severity, vault.detail || `Mapper ${vault.mapperPresent ? 'present' : 'absent'} • marker ${vault.markerPresent ? 'present' : 'absent'} • mount ${vault.mountPresent ? 'present' : 'absent'}`) + renderList(vault.requiredPaths || [], item => listItem(item.path, item.present ? 'Mounted' : 'Absent', item.present ? 'healthy' : vault.state === 'closed' ? 'inactive' : 'critical', item.present ? `${item.fsType || 'unknown'} • ${item.source || 'unknown source'}` : 'No mount')));
    setHtml('mediaServices', listItem('Media summary', media.media?.label || 'Unknown', media.media?.severity, 'Vault-aware service interpretation') + renderList(media.services || [], service => listItem(service.label, service.classification || 'Unknown', service.severity, service.detail || `${formatDuration(service.uptimeSeconds)} • ${service.restarts ?? 0} restarts`)) + renderList(media.cloudMounts || [], mount => listItem(mount.path, mount.present ? (mount.fuse ? 'FUSE mounted' : 'Wrong filesystem') : 'Absent', mount.present && mount.fuse ? 'healthy' : vault.state === 'closed' ? 'inactive' : 'critical', mount.present ? `${mount.fsType || 'unknown'} • ${mount.source || 'unknown source'}` : 'No mount')));
    const aggregate = media.aggregates || {};
    const collection = media.cloudCollection || {};
    const aggregateContent = collection.state === 'not_collected' || collection.state === 'unreadable'
        ? `<div class="empty-state collector-error">${esc(media.cloudError || 'Cloud quota collector setup is incomplete.')}</div>`
        : `${metric(aggregate.partial ? 'Reported aggregate (partial)' : 'Reported aggregate', formatBytes(aggregate.total), `${formatBytes(aggregate.free)} free • ${aggregate.reportedProviders || 0}/${aggregate.totalProviders || 0} providers`)}${metric('Largest reported provider free', formatBytes(aggregate.largestProviderFree?.bytes), aggregate.largestProviderFree?.provider || 'No reported quota')}`;
    setHtml('cloudAggregate', `${aggregateContent}${metric('Collector state', (collection.state || 'unknown').replace('_', ' '), `Last collection ${formatTime(collection.lastCollectedAt)}`)}<p class="fine-print">Single-file upper bound only. Actual placement is lower because of rclone crypt overhead and the importer safety margin.</p>`);
    const health = media.health || {};
    setHtml('mediaHealth', listItem('Timer', health.state || 'unavailable', health.severity, `Last ${formatTime(health.timer?.lastTrigger)} • next ${formatTime(health.timer?.nextRun)}`) + listItem('Last service result', health.service?.result || 'unknown', health.service?.result === 'success' ? 'healthy' : health.severity));
    setHtml('mediaCapacity', renderList(media.capacity || [], item => `<div class="capacity-card"><div class="list-top"><div><div class="list-title">${esc(item.label)}</div><div class="list-meta mono">${esc(item.path)}</div></div>${badge(item.available === false ? 'unavailable' : `${item.usedPct}%`, item.severity)}</div>${capacityBar(item.usedBytes, item.totalBytes)}<div class="list-meta">${esc(formatBytes(item.freeBytes))} free of ${esc(formatBytes(item.totalBytes))}</div></div>`));
    setHtml('providerCards', renderList(media.providers || [], provider => {
        const quota = provider.quota || {}; const reminder = provider.reminder || {};
        const quotaLabel = provider.quotaState === 'stale' ? `Stale${provider.reachability === 'failed' ? ' • refresh failed' : ''}` : provider.quotaState === 'fresh' ? 'Fresh' : 'Not collected';
        const quotaSeverity = provider.quotaState === 'fresh' ? 'healthy' : provider.quotaState === 'stale' ? 'warning' : 'inactive';
        const lastLogin = reminder.history?.length ? reminder.history[reminder.history.length - 1] : reminder.lastConfirmedAt;
        return `<article class="provider-card"><div class="list-top"><div class="list-title mono">${esc(provider.id)}</div>${badge(quotaLabel, quotaSeverity)}</div>${capacityBar(quota.used, quota.total)}<div class="provider-stats"><span><strong>Used</strong>${esc(formatBytes(quota.used))}</span><span><strong>Free</strong>${esc(formatBytes(quota.free))}</span><span><strong>Total</strong>${esc(formatBytes(quota.total))}</span></div><div class="list-meta">Last successful quota: ${esc(formatTime(provider.lastSuccess))}${provider.errorCategory ? ` • ${esc(provider.errorCategory)}` : ''}</div><div class="list-meta">Last confirmed login: ${esc(formatTime(lastLogin))} • ${(reminder.history || []).length} saved confirmation${(reminder.history || []).length === 1 ? '' : 's'}</div><div class="reminder-row">${badge(reminder.label || 'Login date not recorded', reminder.severity)}<button class="ghost-button" data-provider-login="${esc(provider.id)}">I logged in today</button></div></article>`;
    }, media.cloudError || 'No active providers in the cached registry.'));
    setHtml('mediaDiagnostics', renderList(media.diagnostics || [], message => `<div class="event-item mono">${esc(message)}</div>`, 'No recent media errors.'));
    const evidence = media.evidence || {};
    setHtml('mediaEvidence', renderList(evidence.systemd || [], unit => `<div class="event-item mono">${esc(Object.entries(unit).map(([key, value]) => `${key}=${value ?? ''}`).join(' • '))}</div>`, 'No raw systemd evidence.') + renderList(evidence.mounts || [], mount => `<div class="event-item mono">${esc(`${mount.path}: ${mount.present ? 'present' : 'absent'} • ${mount.fsType || 'no filesystem'} • ${mount.source || 'no source'}`)}</div>`, 'No mount evidence.'));
    document.querySelectorAll('[data-provider-login]').forEach(button => { button.onclick = async () => { const provider = button.getAttribute('data-provider-login'); button.disabled = true; try { await postJson(`${apiBase}/media/providers/${encodeURIComponent(provider)}/login`); state.media = await fetchJson(endpoints.media); renderMedia(); renderOverviewMedia(); } catch (error) { showGlobalError(error); } finally { button.disabled = false; } }; });
}

function renderServices() {
    const services = state.services || {};
    const mediaServices = new Map((state.media?.services || []).map(item => [item.name.replace(/\.service$/, ''), item]));
    renderTable('systemdTable', ['Service', 'State', 'Subtype', 'Role', 'Critical'], (services.systemd || []).map(item => {
        const interpreted = mediaServices.get(item.name.replace(/\.service$/, ''));
        return `<div class="table-row"><div><div class="list-title">${esc(item.label)}</div><div class="list-meta mono">${esc(item.name)}</div></div><div>${badge(interpreted?.classification || item.state, interpreted?.severity || item.severity)}</div><div>${esc(interpreted?.detail || item.subState)}</div><div>${esc(item.category)}</div><div>${item.critical ? 'Yes' : 'No'}</div></div>`;
    }));
    renderTable('pm2Table', ['App', 'State', 'Restarts', 'Memory', 'Route'], (services.pm2 || []).map(item => `<div class="table-row"><div><div class="list-title">${esc(item.label || item.name)}</div><div class="list-meta mono">${esc(item.cwd || item.name)}</div></div><div>${badge(item.state, item.severity)}</div><div>${esc(item.restarts)}</div><div>${esc(item.memoryMiB)} MiB</div><div>${esc(item.proxyPath || item.proxyHost || item.port)}</div></div>`));
}
function renderProxy() { const value = state.proxy || {}; renderTable('proxyTable', ['Route', 'Public URL', 'Upstream', 'Mode', 'Status'], (value.routes || []).map(item => `<div class="table-row wide"><div><div class="list-title">${esc(item.label)}</div><div class="list-meta mono">${esc(`${item.host}${item.publicPath}`)}</div></div><div>${esc(item.publicUrl || `${item.host}${item.publicPath}`)}</div><div>${esc(item.target)}</div><div>${esc(item.healthMode || 'http')}</div><div>${badge(item.probe ? (item.probe.ok ? item.probe.status : 'fail') : 'static', item.severity)}</div></div>`)); }
function renderStorage() { const value = state.storage || {}; renderTable('storageTable', ['Mount', 'Used', 'Free', 'Filesystem', 'State'], (value.mounts || []).map(item => `<div class="table-row"><div><div class="list-title">${esc(item.label)}</div><div class="list-meta mono">${esc(item.mount)} • ${esc(item.source)}</div></div><div>${esc(item.usedGiB)}/${esc(item.totalGiB)} GiB</div><div>${esc(item.freeGiB)} GiB</div><div>${esc(item.fsType)}</div><div>${badge(`${item.usedPct}%`, item.severity)}</div></div>`)); setHtml('topConsumers', renderList(value.topConsumers || [], item => listItem(item.path, `${item.usedGiB} GiB`, 'warning'), 'Top-consumer scan unavailable.')); }
function renderNetwork() { const value = state.network || {}; renderTable('networkTable', ['Interface', 'State', 'Address', 'Traffic', 'Role'], (value.interfaces || []).map(item => `<div class="table-row"><div>${esc(item.label)}<div class="list-meta">${esc(item.name)}</div></div><div>${badge(item.state, item.severity)}</div><div>${esc(item.address)}</div><div>↓ ${esc(item.rxMbps)} ↑ ${esc(item.txMbps)} MB/s</div><div>${esc(item.role)}</div></div>`)); renderTable('listenersTable', ['Listener', 'Bind', 'Port', 'Exposure', 'Process'], (value.listeners || []).slice(0, 12).map(item => `<div class="table-row"><div>${esc(item.protocol)}</div><div>${esc(item.address)}</div><div>${esc(item.port)}</div><div>${esc(item.exposure)}</div><div>${esc(item.process)}</div></div>`)); }
function renderDns() { const dns = state.dns || {}; const maintenance = state.maintenance || {}; setHtml('dnsDetails', listItem('Pi-hole', dns.piholeEnabled === false ? 'disabled' : 'enabled', dns.piholeEnabled === false ? 'warning' : 'healthy', `FTL ${dns.ftlState || 'unknown'} • Unbound ${dns.unboundState || 'unknown'}`) + listItem('Query profile', `${dns.queryRatePerMinute ?? '—'} qpm`, 'healthy', `Blocked ${dns.blockedPct ?? '—'}% • latency ${dns.latencyMs ?? '—'} ms`)); renderTable('maintenanceTable', ['Timer', 'State', 'Last run', 'Next run', 'Unit'], (maintenance.timers || []).map(item => `<div class="table-row"><div>${esc(item.label || item.name)}</div><div>${badge(item.state, item.state === 'waiting' ? 'healthy' : 'warning')}</div><div>${esc(item.lastRun)}</div><div>${esc(item.nextRun)}</div><div>${esc(item.name)}</div></div>`)); }
function renderEvents() { renderTable('eventsTable', ['Time', 'Source', 'Level', 'Message', ''], (state.logs?.events || []).map(item => `<div class="table-row wide"><div>${esc(formatTime(item.ts))}</div><div>${esc(item.source)}</div><div>${badge(item.level, item.level === 'info' ? 'healthy' : item.level)}</div><div>${esc(item.message)}</div><div></div></div>`)); }

function renderActions() {
    const actions = state.actions?.actions || []; setHtml('actionsList', renderList(actions, item => `<div class="action-item"><div class="list-title">${esc(item.label)}</div><div class="list-meta">${esc(item.description)}</div><button data-global-action="${esc(item.id)}">${item.confirmation ? 'Run with confirmation' : 'Run action'}</button></div>`));
    document.querySelectorAll('[data-global-action]').forEach(button => { button.onclick = async () => { const id = button.getAttribute('data-global-action'); const action = actions.find(item => item.id === id); if (action?.confirmation && !window.confirm(`Run "${action.label}"?`)) return; button.disabled = true; try { const result = await postJson(`${apiBase}/actions/${encodeURIComponent(id)}`); setText('actionOutput', JSON.stringify(result, null, 2)); invalidateAll(); await loadPage(state.activePage); } catch (error) { showGlobalError(error); } finally { button.disabled = false; } }; });
}
function renderPolicy() {
    const policy = state.policy; if (!policy?.runtime) return; const runtime = policy.runtime; const pill = document.getElementById('policyStatus'); pill.className = `status-pill ${safeSeverity(runtime.severity)}`; pill.textContent = runtime.severity;
    setHtml('policyRuntime', `<div class="stats-grid two-up">${metric('State', runtime.state, `Health mode ${runtime.healthMode}`)}${metric('Uptime', formatDuration(runtime.uptimeSeconds), `${runtime.restarts} restarts`)}${metric('Memory', `${runtime.memoryMiB} MiB`, `CPU ${runtime.cpuPct}%`)}${metric('Binding', runtime.port ? `:${runtime.port}` : '—', runtime.proxyHost || 'No proxy host')}</div><div class="stack compact">${(runtime.notes || []).map(note => `<div class="list-item"><div class="list-meta">${esc(note)}</div></div>`).join('')}</div>`);
    setHtml('policyActions', renderList(policy.actions || [], item => `<div class="action-item"><div class="list-title">${esc(item.label)}</div><div class="list-meta">${esc(item.description)}</div><button data-policy-action="${esc(item.id)}">Run${item.confirmation ? ' with confirmation' : ''}</button></div>`));
    setHtml('policyReports', renderList(policy.reports || [], item => `<div class="action-item"><div class="list-title">${esc(item.label)}</div><div class="list-meta">${esc(item.description)}</div><button data-policy-report="${esc(item.id)}">Run report</button></div>`));
    setHtml('policyLogs', renderList(policy.logs || [], item => listItem(item.source, item.level, item.level === 'info' ? 'healthy' : item.level, item.message), 'No recent Policy logs.'));
    document.getElementById('copyPolicyBrief').onclick = () => copyText(buildPolicyBrief(), 'Policy brief');
    document.querySelectorAll('[data-policy-action]').forEach(button => { button.onclick = async () => { const id = button.getAttribute('data-policy-action'); const action = policy.actions.find(item => item.id === id); if (action?.confirmation && !window.confirm(`Run "${action.label}"?`)) return; button.disabled = true; try { const result = await postJson(`${apiBase}/policy/actions/${encodeURIComponent(id)}`); setText('policyActionOutput', JSON.stringify(result, null, 2)); state.policy = await fetchJson(endpoints.policy); renderPolicy(); } catch (error) { setText('policyActionOutput', error.message); } finally { button.disabled = false; } }; });
    document.querySelectorAll('[data-policy-report]').forEach(button => { button.onclick = async () => { const id = button.getAttribute('data-policy-report'); button.disabled = true; try { state.policyInspect = await fetchJson(`${apiBase}/policy/inspect/${encodeURIComponent(id)}`); renderPolicyInspect(); } catch (error) { setText('policyStructuredOutput', error.message); } finally { button.disabled = false; } }; }); renderPolicyInspect();
}
function renderPolicyInspect() { const item = state.policyInspect; setText('policyStructuredOutput', item?.structuredText || 'Run a report to generate a structured brief.'); setText('policyRawOutput', item?.rawText || 'Run a report to capture raw output.'); document.getElementById('copyPolicyStructured').onclick = item ? () => copyText(item.structuredText, 'Policy structured brief') : null; document.getElementById('copyPolicyRaw').onclick = item ? () => copyText(item.rawText, 'Policy raw output') : null; }

function buildOverviewBrief() { const core = state.overviewCore || {}; const media = state.media || {}; return ['# Pi Dashboard Overview Brief', `Generated: ${new Date().toLocaleString()}`, `Overall: ${media.overall?.label || 'Unavailable'}`, `Host: ${core.summary?.hostname || 'Unavailable'}`, `Vault: ${media.vault?.classification || 'Unavailable'}`, `Media: ${media.media?.label || 'Unavailable'} — ${(media.services || []).map(item => `${item.label}=${item.classification || 'Unknown'}`).join(', ') || 'Unavailable'}`, `Cloud: ${formatBytes(media.aggregates?.free)} free${media.aggregates?.partial ? ' (partial)' : ''}`].join('\n\n'); }
function buildPolicyBrief() { const runtime = state.policy?.runtime || {}; return ['# Policy Service Brief', `Generated: ${new Date().toLocaleString()}`, `State: ${runtime.state || 'Unavailable'}`, `Uptime: ${formatDuration(runtime.uptimeSeconds)}`, `Restarts: ${runtime.restarts ?? '—'}`].join('\n\n'); }

const pageLoaders = {
    overview: async () => { const [core, media] = await Promise.all([fetchJson(endpoints.overviewCore), fetchJson(endpoints.media)]); state.overviewCore = core; state.media = media; renderOverview(); fetchJson(endpoints.overviewExtended).then(value => { state.overviewExtended = value; renderOverviewExtended(); }).catch(showGlobalError); },
    media: async () => { state.media = await fetchJson(endpoints.media); renderMedia(); },
    policy: async () => { state.policy = await fetchJson(endpoints.policy); renderPolicy(); }, services: async () => { [state.services, state.media] = await Promise.all([fetchJson(endpoints.services), fetchJson(endpoints.media)]); renderServices(); },
    proxy: async () => { state.proxy = await fetchJson(endpoints.proxy); renderProxy(); }, storage: async () => { state.storage = await fetchJson(endpoints.storage); renderStorage(); },
    network: async () => { state.network = await fetchJson(endpoints.network); renderNetwork(); },
    dns: async () => { [state.dns, state.maintenance] = await Promise.all([fetchJson(endpoints.dns), fetchJson(endpoints.maintenance)]); renderDns(); },
    events: async () => { state.logs = await fetchJson(endpoints.logs); renderEvents(); }, actions: async () => { state.actions = await fetchJson(endpoints.actions); renderActions(); },
};
function invalidateAll() { for (const key of Object.keys(state)) if (!['activePage', 'refreshing'].includes(key)) state[key] = null; }
async function loadPage(page) { state.activePage = page; await pageLoaders[page]?.(); }
function bindNavigation() { document.querySelectorAll('.nav-link').forEach(button => button.addEventListener('click', async () => { const target = button.getAttribute('data-target'); document.querySelectorAll('.nav-link').forEach(item => item.classList.toggle('active', item === button)); document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.id === `page-${target}`)); try { await loadPage(target); } catch (error) { showGlobalError(error); } })); }
async function refreshVisible(kind) { if (document.hidden || state.refreshing) return; if (kind === 'fast' && !['overview', 'media'].includes(state.activePage)) return; if (kind === 'slow' && ['overview', 'media'].includes(state.activePage)) return; state.refreshing = true; try { await loadPage(state.activePage); } catch (error) { showGlobalError(error); } finally { state.refreshing = false; } }
async function boot() { bindNavigation(); try { state.actions = await fetchJson(endpoints.actions); renderActions(); await loadPage('overview'); } catch (error) { showGlobalError(error); } window.setInterval(() => refreshVisible('fast'), 15000); window.setInterval(() => refreshVisible('slow'), 60000); }
boot();
