import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function runCommand(command, args = [], options = {}) {
    try {
        const result = await execFileAsync(command, args, {
            timeout: options.timeout ?? 5000,
            maxBuffer: options.maxBuffer ?? 1024 * 1024,
            env: process.env,
            cwd: options.cwd,
        });
        return {
            ok: true,
            stdout: result.stdout?.trim() || '',
            stderr: result.stderr?.trim() || '',
        };
    } catch (error) {
        return {
            ok: false,
            stdout: error.stdout?.trim() || '',
            stderr: error.stderr?.trim() || error.message,
            code: error.code ?? null,
        };
    }
}
