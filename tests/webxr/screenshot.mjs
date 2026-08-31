// Manual render-and-screenshot tool (dev-only). Opens tests/webxr/render.html
// in headless Chromium (with a software GL) at several times of day and writes
// PNGs, so the scene look and day/night cycle can be reviewed without a Moodle
// site or a headset. Usage: node screenshot.mjs [outDir]

import {chromium} from 'playwright';
import {fileURLToPath} from 'url';
import {dirname, join, extname, normalize} from 'path';
import {createServer} from 'http';
import {readFile} from 'fs/promises';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = normalize(join(here, '..', '..'));
const exe = process.env.PW_CHROMIUM || null;
const outDir = process.argv[2] || here;

const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.map': 'application/json', '.json': 'application/json'
};
const server = createServer(async (req, res) => {
    try {
        const p = normalize(join(repoRoot, decodeURIComponent(req.url.split('?')[0])));
        if (!p.startsWith(repoRoot)) {
            res.writeHead(403);
            res.end();
            return;
        }
        const body = await readFile(p);
        res.writeHead(200, {'Content-Type': MIME[extname(p)] || 'application/octet-stream'});
        res.end(body);
    } catch (e) {
        res.writeHead(404);
        res.end();
    }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const shots = [
    {label: 'day', q: 'hour=13'},
    {label: 'dusk', q: 'hour=18.5'},
    {label: 'night', q: 'hour=22'}
];

const launchOpts = {
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']
};
if (exe) {
    launchOpts.executablePath = exe;
}
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({viewport: {width: 1280, height: 720}});
page.on('pageerror', (e) => console.error('pageerror:', String(e)));

for (const s of shots) {
    const url = `http://127.0.0.1:${port}/tests/webxr/render.html?${s.q}`;
    await page.goto(url);
    try {
        await page.waitForFunction(() => window.__ready === true || window.__err, {timeout: 15000});
    } catch (e) {
        console.error(`${s.label}: timed out`);
    }
    const err = await page.evaluate(() => window.__err || null);
    if (err) {
        console.error(`${s.label}: scene error:\n${err}`);
        continue;
    }
    const file = join(outDir, `scene-${s.label}.png`);
    await page.screenshot({path: file});
    console.log(`wrote ${file}`);
}

await browser.close();
server.close();
