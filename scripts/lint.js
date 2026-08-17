import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const roots = ['server.js', 'src', 'public/app.js', 'scripts', 'test'];
const files = [];
function visit(target) {
    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
        for (const entry of fs.readdirSync(target)) visit(path.join(target, entry));
    } else if (target.endsWith('.js') && target !== import.meta.filename) files.push(target);
}
for (const root of roots) if (fs.existsSync(root)) visit(root);
for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) {
        process.stderr.write(result.stderr);
        process.exitCode = 1;
    }
}
if (!process.exitCode) process.stdout.write(`Syntax checked ${files.length} JavaScript files.\n`);
