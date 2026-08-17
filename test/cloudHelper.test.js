import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const helper = fileURLToPath(new URL('../deploy/pi-dashboard-cloud-status', import.meta.url));

function run(command, args, options) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, options); let stdout = ''; let stderr = '';
        child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
        child.once('error', reject); child.once('close', code => resolve({ code, stdout, stderr }));
    });
}

test('root helper writes sanitized quotas and preserves successful values on failure', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-cloud-helper-'));
    const bin = path.join(directory, 'bin'); await fs.mkdir(bin);
    const fakeRunuser = path.join(bin, 'runuser');
    await fs.writeFile(fakeRunuser, '#!/bin/sh\nif [ "$FAKE_RCLONE_MODE" = fail ] || { [ "$FAKE_RCLONE_MODE" = partial ] && echo "$*" | grep -q "ocean-b:"; }; then echo "token=not-persisted" >&2; exit 1; fi\ncase "$*" in *"config redacted ocean-a"*) printf "user = ocean-a@example.com\\n"; exit 0;; *"config redacted ocean-b"*) printf "username = ocean-b@example.com\\npassword = should-not-escape\\n"; exit 0;; esac\nprintf \'%s\\n\' \'{"total":100,"used":40,"free":60,"extra":"discarded"}\'\n', { mode: 0o755 });
    const providers = path.join(directory, 'providers.list'); const cache = path.join(directory, 'cloud-status.json'); const rcloneConfig = path.join(directory, 'rclone.conf'); const accounts = path.join(directory, 'accounts.json');
    await fs.writeFile(providers, 'ocean-a\nocean-b\n');
    await fs.writeFile(rcloneConfig, '[test]\n');
    await fs.writeFile(accounts, '{"ocean-a":"Luke primary"}\n');
    const env = { ...process.env, PI_DASHBOARD_RUNUSER_BINARY: fakeRunuser, PI_DASHBOARD_RCLONE_BINARY: fakeRunuser, PI_DASHBOARD_PASSWORD_COMMAND: '', PI_DASHBOARD_PROVIDERS: providers, PI_DASHBOARD_PROVIDER_ACCOUNTS: accounts, PI_DASHBOARD_CLOUD_CACHE: cache, PI_DASHBOARD_RCLONE_CONFIG: rcloneConfig };
    const firstRun = await run('python3', [helper], { env });
    assert.equal(firstRun.code, 0, firstRun.stderr);
    const success = JSON.parse(await fs.readFile(cache, 'utf8'));
    assert.deepEqual(success.providers['ocean-a'].quota, { total: 100, used: 40, free: 60, trashed: null });
    assert.equal(success.providers['ocean-a'].account, 'Luke primary');
    assert.equal(success.providers['ocean-b'].account, 'ocean-b@example.com');
    assert.equal(JSON.stringify(success).includes('should-not-escape'), false);
    assert.deepEqual(Object.keys(success.providers), ['ocean-a', 'ocean-b']);
    assert.equal(JSON.stringify(success).includes('extra'), false);
    assert.equal((await run('python3', [helper], { env: { ...env, FAKE_RCLONE_MODE: 'fail' } })).code, 0);
    const failed = JSON.parse(await fs.readFile(cache, 'utf8'));
    assert.deepEqual(failed.providers['ocean-a'].quota, success.providers['ocean-a'].quota);
    assert.equal(JSON.stringify(failed).includes('not-persisted'), false);
    assert.equal((await run('python3', [helper], { env: { ...env, FAKE_RCLONE_MODE: 'partial' } })).code, 0);
    const partial = JSON.parse(await fs.readFile(cache, 'utf8'));
    assert.equal(partial.providers['ocean-a'].reachability, 'ok'); assert.equal(partial.providers['ocean-b'].reachability, 'failed');
    assert.deepEqual(partial.providers['ocean-b'].quota, success.providers['ocean-b'].quota);
});

test('root helper fails setup and preserves cache verbatim while provider registry is unavailable', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-cloud-locked-')); const cache = path.join(directory, 'cloud-status.json');
    await fs.writeFile(cache, '{"version":1,"sentinel":"unchanged"}\n');
    const result = await run('python3', [helper], { env: { ...process.env, PI_DASHBOARD_PROVIDERS: path.join(directory, 'missing'), PI_DASHBOARD_CLOUD_CACHE: cache } });
    assert.equal(result.code, 2); assert.match(result.stderr, /collector setup error/); assert.deepEqual(JSON.parse(await fs.readFile(cache, 'utf8')), { version: 1, sentinel: 'unchanged' });
});

test('root helper rejects invalid registry entries before running providers', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-cloud-invalid-'));
    const executable = path.join(directory, 'tool'); const config = path.join(directory, 'rclone.conf'); const providers = path.join(directory, 'providers.list');
    await fs.writeFile(executable, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    await fs.writeFile(config, '[test]\n'); await fs.writeFile(providers, 'valid\ninvalid:name\n');
    const result = await run('python3', [helper], { env: { ...process.env, PI_DASHBOARD_RUNUSER_BINARY: executable, PI_DASHBOARD_RCLONE_BINARY: executable, PI_DASHBOARD_PASSWORD_COMMAND: '', PI_DASHBOARD_RCLONE_CONFIG: config, PI_DASHBOARD_PROVIDERS: providers, PI_DASHBOARD_CLOUD_CACHE: path.join(directory, 'cache.json') } });
    assert.equal(result.code, 2); assert.match(result.stderr, /invalid identifier/);
});
