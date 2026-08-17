import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

test('provider cards render explicit numeric fields and stale refresh context', async () => {
    const source = await fs.readFile(new URL('../public/app.js', import.meta.url), 'utf8');
    assert.match(source, /<strong>Used<\/strong>/);
    assert.match(source, /<strong>Free<\/strong>/);
    assert.match(source, /<strong>Total<\/strong>/);
    assert.match(source, /refresh failed/);
    assert.match(source, /Last successful quota/);
    assert.match(source, /Account:/);
    assert.match(source, /Could not save:/);
});
