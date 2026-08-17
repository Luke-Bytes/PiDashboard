import assert from 'node:assert/strict';
import test from 'node:test';

import { sameOriginOnly } from '../src/middleware/sameOrigin.js';

function evaluate(headers, protocol = 'http') {
    let status = 200; let payload = null; let passed = false;
    const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
    const req = { method: 'POST', protocol, get: name => normalized[name.toLowerCase()] };
    const res = { status(value) { status = value; return this; }, json(value) { payload = value; return this; } };
    sameOriginOnly(req, res, () => { passed = true; });
    return { status, payload, passed };
}

test('POST rejects missing and foreign origins and accepts exact origin', () => {
    assert.equal(evaluate({ host: 'anniwars.win' }, 'https').status, 403);
    assert.equal(evaluate({ host: 'anniwars.win', origin: 'https://foreign.example' }, 'https').status, 403);
    assert.equal(evaluate({ host: 'anniwars.win', origin: 'https://anniwars.win' }, 'https').passed, true);
});

test('reverse-proxy protocol is respected', () => {
    assert.equal(evaluate({ host: 'anniwars.win', origin: 'https://anniwars.win', 'x-forwarded-proto': 'https' }).passed, true);
    assert.equal(evaluate({ host: '127.0.0.1:4000', origin: 'https://anniwars.win', 'x-forwarded-proto': 'http' }).passed, true);
    assert.equal(evaluate({ host: 'anniwars.win', origin: 'http://anniwars.win', 'x-forwarded-proto': 'https' }).status, 403);
});
