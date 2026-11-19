import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Set up base directory paths and ensure the screenshot directory exists.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.join(__dirname, 'app');
const screenshotsDir = path.join(__dirname, 'screenshots');
fs.mkdirSync(screenshotsDir, { recursive: true });

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

const server = http.createServer((req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
    let pathname = parsedUrl.pathname;
    if (pathname === '/') {
      pathname = '/index.html';
    }

    const safePath = path.normalize(path.join(appDir, pathname));
    if (!safePath.startsWith(path.resolve(appDir))) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    if (fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
      const ext = path.extname(safePath).toLowerCase();
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      fs.createReadStream(safePath).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
});

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const require = createRequire(path.join('/home/hatch/workspace/tools/shots', 'package.json'));
  const { chromium } = require('playwright-core');

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const shotsConfigPath = path.join(__dirname, 'shots.json');
  const shots = JSON.parse(fs.readFileSync(shotsConfigPath, 'utf8'));

  const allRequests = [];
  const allErrors = [];

  for (const shot of shots) {
    const context = await browser.newContext({
      viewport: shot.viewport || { width: 1280, height: 800 }
    });
    const page = await context.newPage();

    page.on('request', req => {
      allRequests.push(req.url());
    });
    page.on('console', msg => {
      if (msg.type() === 'error') {
        allErrors.push(msg.text());
      }
    });
    page.on('pageerror', err => {
      allErrors.push(err.message);
    });

    const targetUrl = `${baseUrl}${shot.path || '/'}`;
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

    let ready = false;
    let attempts = 0;
    while (!ready && attempts < 150) {
      ready = await page.evaluate(() => window.__shotReady === true).catch(() => false);
      if (!ready) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
      }
    }

    if (!ready) {
      console.error(`Shot ${shot.file} timed out waiting for __shotReady. Errors encountered:`, allErrors);
      await browser.close();
      server.close();
      process.exit(1);
    }

    // Additional short settle delay for rendering
    await new Promise(r => setTimeout(r, 300));

    const outFilePath = path.join(screenshotsDir, shot.file);
    await page.screenshot({ path: outFilePath, type: 'jpeg', quality: 82 });
    await context.close();
  }

  // Tracker proof run
  const proofContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    acceptDownloads: true
  });
  const proofPage = await proofContext.newPage();

  proofPage.on('request', req => {
    allRequests.push(req.url());
  });
  proofPage.on('console', msg => {
    if (msg.type() === 'error') allErrors.push(msg.text());
  });
  proofPage.on('pageerror', err => allErrors.push(err.message));

  await proofPage.goto(`${baseUrl}/index.html`, { waitUntil: 'domcontentloaded' });

  let proofReady = false;
  let pAttempts = 0;
  while (!proofReady && pAttempts < 150) {
    proofReady = await proofPage.evaluate(() => window.__shotReady === true).catch(() => false);
    if (!proofReady) {
      await new Promise(r => setTimeout(r, 100));
      pAttempts++;
    }
  }

  if (!proofReady) {
    console.error('Tracker proof timed out waiting for ready');
    await browser.close();
    server.close();
    process.exit(1);
  }

  // 1. Click first trophy checkbox
  await proofPage.click('.trophy-checkbox');
  // 2. Reload page and verify checkbox remains checked
  await proofPage.reload({ waitUntil: 'domcontentloaded' });
  
  let reloadReady = false;
  let rAttempts = 0;
  while (!reloadReady && rAttempts < 150) {
    reloadReady = await proofPage.evaluate(() => window.__shotReady === true).catch(() => false);
    if (!reloadReady) {
      await new Promise(r => setTimeout(r, 100));
      rAttempts++;
    }
  }

  const isChecked = await proofPage.$eval('.trophy-checkbox', el => el.checked).catch(() => false);
  if (!isChecked) {
    console.error('Tracker proof failed: trophy checkbox not checked after reload');
    await browser.close();
    server.close();
    process.exit(1);
  }

  // 3. Click export button and wait for download
  const downloadPromise = proofPage.waitForEvent('download', { timeout: 10000 }).catch(() => null);
  await proofPage.click('#export-btn');
  const download = await downloadPromise;
  if (!download) {
    console.error('Tracker proof failed: export download did not trigger');
    await browser.close();
    server.close();
    process.exit(1);
  }

  const downloadedFilePath = path.join(__dirname, 'test-export.json');
  await download.saveAs(downloadedFilePath);

  // 4. Clear localStorage and verify unchecked
  await proofPage.evaluate(() => localStorage.clear());
  await proofPage.reload({ waitUntil: 'domcontentloaded' });
  
  let clearReady = false;
  let cAttempts = 0;
  while (!clearReady && cAttempts < 150) {
    clearReady = await proofPage.evaluate(() => window.__shotReady === true).catch(() => false);
    if (!clearReady) {
      await new Promise(r => setTimeout(r, 100));
      cAttempts++;
    }
  }

  const isCheckedCleared = await proofPage.$eval('.trophy-checkbox', el => el.checked).catch(() => true);
  if (isCheckedCleared) {
    console.error('Tracker proof failed: localStorage not cleared');
    await browser.close();
    server.close();
    process.exit(1);
  }

  // 5. Import downloaded file and verify checked again
  await proofPage.setInputFiles('#import-input', downloadedFilePath);
  await new Promise(r => setTimeout(r, 800));

  const isCheckedRestored = await proofPage.$eval('.trophy-checkbox', el => el.checked).catch(() => false);
  if (!isCheckedRestored) {
    console.error('Tracker proof failed: import did not restore trophy check');
    await browser.close();
    server.close();
    process.exit(1);
  }

  // Clean up temporary download file
  if (fs.existsSync(downloadedFilePath)) {
    fs.unlinkSync(downloadedFilePath);
  }

  await browser.close();
  server.close();

  // Validate network requests
  for (const reqUrl of allRequests) {
    try {
      const u = new URL(reqUrl);
      if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
        console.error(`External network request detected: ${reqUrl}`);
        process.exit(1);
      }
    } catch {
      // invalid URL or relative
    }
  }

  if (allErrors.length > 0) {
    console.error('Console or page errors detected:', allErrors);
    process.exit(1);
  }

  // Print screenshot stats
  function getJpegDimensions(buffer) {
    let offset = 2;
    while (offset < buffer.length) {
      let marker = buffer.readUInt16BE(offset);
      let length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xFFC0 && marker <= 0xFFCF && marker !== 0xFFC4 && marker !== 0xFFC8 && marker !== 0xFFCC) {
        let h = buffer.readUInt16BE(offset + 5);
        let w = buffer.readUInt16BE(offset + 7);
        return { width: w, height: h };
      }
      offset += 2 + length;
    }
    return { width: 0, height: 0 };
  }

  for (const shot of shots) {
    const fPath = path.join(screenshotsDir, shot.file);
    const stats = fs.statSync(fPath);
    const buf = fs.readFileSync(fPath);
    const dims = getJpegDimensions(buf);
    console.log(`${shot.file}: ${stats.size} bytes, ${dims.width}x${dims.height}`);
  }

  process.exit(0);
});
