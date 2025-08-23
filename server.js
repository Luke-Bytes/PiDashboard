import express from 'express';
import os from 'os';
import fs from 'fs/promises';
import si from 'systeminformation';

const app = express();
const PORT = Number(process.env.PORT || 4000);
const HOST = '127.0.0.1';

const gb = b => b / 1024 / 1024 / 1024;

async function readThermalFallback() {
    const candidates = [
        '/sys/class/thermal/thermal_zone0/temp',
        '/sys/devices/virtual/thermal/thermal_zone0/temp'
    ];
    for (const p of candidates) {
        try {
            const raw = await fs.readFile(p, 'utf8');
            const milliC = parseInt(raw.trim(), 10);
            if (!Number.isNaN(milliC)) return milliC / 1000;
        } catch {}
    }
    return null;
}

function isRealMount(d) {
    const badFs = new Set(['squashfs', 'tmpfs', 'devtmpfs', 'overlay', 'ramfs', 'aufs']);
    return d.mount?.startsWith('/') && !badFs.has(d.fsType || '');
}
function isNoisyIface(name) {
    return (
        name === 'lo' ||
        name.startsWith('veth') || name.startsWith('docker') ||
        name.startsWith('br-')  || name.startsWith('tun')    ||
        name.startsWith('wg')
    );
}

app.get('/api/healthz', (_req, res) => res.type('text/plain').send('ok'));

app.get('/api/stats', async (_req, res) => {
    try {
        const [
            cpuLoad, mem, temp, fsList, netStats, cpu, netIfs,
            fsStats, disksIO, defaultIfaceName
        ] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.cpuTemperature(),
            si.fsSize(),
            si.networkStats(),
            si.cpu(),
            si.networkInterfaces(),
            si.fsStats(),
            si.disksIO(),
            si.networkInterfaceDefault().catch(() => null)
        ]);

        let tempC = temp?.main ?? null;
        if (tempC === null) tempC = await readThermalFallback();

        const totalMemGB = gb(mem.total);
        const usedMemGB  = gb(mem.active);
        const memPct = (mem.active / mem.total) * 100;

        const disks = fsList.filter(isRealMount).map(d => {
            const usedGB = gb(d.used);
            const totalGB = gb(d.size);
            const pct = totalGB > 0 ? (usedGB / totalGB) * 100 : 0;
            return {
                mount: d.mount,
                fsType: d.fsType,
                usedGB: Number(usedGB.toFixed(2)),
                totalGB: Number(totalGB.toFixed(2)),
                usedPct: Number(pct.toFixed(1))
            };
        });

        const net = netStats
            .filter(n => !isNoisyIface(n.iface))
            .map(n => ({
                iface: n.iface,
                rxMBs: Number((n.rx_sec / 1024 / 1024).toFixed(2)),
                txMBs: Number((n.tx_sec / 1024 / 1024).toFixed(2)),
            }));

        const primaryIface =
            (defaultIfaceName && !isNoisyIface(defaultIfaceName)) ? defaultIfaceName : null;

        const payload = {
            host: os.hostname(),
            cpu: {
                model: `${cpu.manufacturer} ${cpu.brand}`.trim(),
                cores: cpu.physicalCores || cpu.cores || null,
                load: Number(cpuLoad.currentLoad.toFixed(1)),
            },
            memory: {
                usedGB: Number(usedMemGB.toFixed(2)),
                totalGB: Number(totalMemGB.toFixed(2)),
                usedPct: Number(memPct.toFixed(1)),
            },
            temperatureC: tempC,
            disks,
            fsio: {
                readBps: Math.max(0, Math.round(fsStats.rx_sec ?? 0)),
                writeBps: Math.max(0, Math.round(fsStats.wx_sec ?? 0)),
                rIOps: Math.max(0, Math.round(disksIO.rIO_sec ?? 0)),
                wIOps: Math.max(0, Math.round(disksIO.wIO_sec ?? 0)),
            },
            network: net,
            primaryIface,
            uptimeSec: os.uptime(),
            loadavg: os.loadavg(),
            ts: Date.now()
        };

        res.set('Cache-Control', 'no-store');
        res.json(payload);
    } catch (err) {
        res.status(500).json({ error: String(err) });
    }
});

app.listen(PORT, HOST, () => {
    console.log(`Pi Dashboard on http://${HOST}:${PORT}`);
});
