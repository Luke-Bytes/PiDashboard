import assert from 'node:assert/strict';
import test from 'node:test';

import { aggregateQuotas, classifyQuotaError, isValidProviderId, parseQuota, redactSecrets } from '../src/lib/cloudQuota.js';

test('quota parsing accepts only numeric quota fields', () => {
    assert.deepEqual(parseQuota('{"total":100,"used":40,"free":60}'), { total: 100, used: 40, free: 60, trashed: null });
    assert.throws(() => parseQuota('{"message":"ok"}'), /unsupported/);
});

test('aggregation labels partial results and finds largest free provider', () => {
    const result = aggregateQuotas([{ id: 'a', quota: { total: 100, used: 40, free: 60 } }, { id: 'b', quota: null }]);
    assert.equal(result.partial, true); assert.equal(result.free, 60); assert.deepEqual(result.largestProviderFree, { provider: 'a', bytes: 60 });
    assert.equal(aggregateQuotas([{ id: 'a', quota: { total: null, used: 40, free: 60 } }]).total, null);
});

test('provider identifiers are allowlisted', () => {
    assert.equal(isValidProviderId('ocean-1_backup'), true);
    for (const value of ['', '../x', 'a:b', '<script>', 'a'.repeat(65)]) assert.equal(isValidProviderId(value), false);
});

test('diagnostics redact likely secrets and expose only safe classes', () => {
    const output = redactSecrets('password=hunter2 token:abcdef0123456789abcdef0123456789');
    assert.doesNotMatch(output, /hunter2|abcdef0123456789/);
    assert.equal(classifyQuotaError('request timed out token=secretvalue'), 'timeout');
    assert.equal(classifyQuotaError('401 invalid_grant'), 'authentication_failure');
});
