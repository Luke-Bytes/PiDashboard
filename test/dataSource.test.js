import assert from 'node:assert/strict';
import test from 'node:test';

import { CRITICAL_SYSTEMD_SERVICES, PM2_APP_METADATA } from '../src/config/topology.js';
import { APP_CONFIG } from '../src/config/settings.js';
import { withDataSource } from '../src/lib/dataSource.js';

test('live collector failure is explicit and never silently replaced by fixture data', async () => {
    const result = await withDataSource('services', async () => null)();
    assert.equal(result.available, false);
    assert.equal(result.status, 'unavailable');
    assert.equal('systemd' in result, false);
});

test('curated registry contains verified media and infrastructure units', () => {
    const names = new Set(CRITICAL_SYSTEMD_SERVICES.map(item => item.name));
    for (const name of ['jellyfin.service', 'rclone-ocean.service', 'rclone-jellyfin-pool.service', 'rclone-pool-health.timer', 'nginx.service', 'pihole-FTL.service', 'openclaw-gateway.service', 'ssh.service', 'pm2-luke.service']) assert.ok(names.has(name), name);
    assert.equal(PM2_APP_METADATA['pi-dashboard'].critical, true);
});

test('media topology defaults match the deployed vault layout', () => {
    assert.equal(APP_CONFIG.media.vaultMarker, '/srv/secure/.securevault-marker');
    assert.equal(APP_CONFIG.media.poolMount, '/srv/secure/cloud/pool');
    assert.equal(APP_CONFIG.media.oceanMount, '/mnt/jellyfin-cloud/ocean-source');
    assert.equal(APP_CONFIG.media.transitionGraceMs, 60000);
});
