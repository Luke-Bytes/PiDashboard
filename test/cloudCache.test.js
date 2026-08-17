import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { readCloudCache } from '../src/collectors/media.js';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.parse('2026-08-18T12:00:00Z');

async function cacheFile(value) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-cloud-cache-'));
    const file = path.join(directory, 'cloud-status.json');
    await fs.writeFile(file, `${JSON.stringify(value)}\n`);
    return file;
}

test('cloud cache reports fresh collection and fresh provider quota', async () => {
    const generatedAt = new Date(now - DAY).toISOString();
    const file = await cacheFile({ version: 1, generatedAt, providerRegistry: ['drime-1'], providers: { 'drime-1': { quota: { total: 100, used: 40, free: 60, trashed: 1 }, reachability: 'ok', lastSuccess: generatedAt } } });
    const result = await readCloudCache(file, now, 9 * DAY);
    assert.equal(result.state, 'fresh'); assert.equal(result.collectedAt, generatedAt); assert.equal(result.providers[0].quotaState, 'fresh');
});

test('old collection and failed provider retain numbers but report stale', async () => {
    const generatedAt = new Date(now - 10 * DAY).toISOString();
    const file = await cacheFile({ version: 1, generatedAt, providerRegistry: ['drime-1'], providers: { 'drime-1': { quota: { total: 100, used: 40, free: 60 }, reachability: 'failed', lastSuccess: new Date(now - DAY).toISOString(), errorCategory: 'timeout' } } });
    const result = await readCloudCache(file, now, 9 * DAY);
    assert.equal(result.state, 'stale'); assert.equal(result.providers[0].quotaState, 'stale'); assert.equal(result.providers[0].quota.free, 60);
});

test('cloud cache distinguishes not collected from unreadable', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-cloud-missing-'));
    assert.equal((await readCloudCache(path.join(directory, 'missing.json'), now)).state, 'not_collected');
    const broken = path.join(directory, 'broken.json'); await fs.writeFile(broken, '{broken');
    assert.equal((await readCloudCache(broken, now)).state, 'unreadable');
});
