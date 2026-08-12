import { chromium } from 'playwright';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const axePath = path.join(
  path.dirname(require.resolve('axe-core/package.json')),
  'axe.min.js',
);

const BASE = 'http://localhost:3000';
const AXE_OPTS = {
  resultTypes: ['violations'],
  runOnly: {
    type: 'tag',
    values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'],
  },
};

const post = (p, b) =>
  fetch(BASE + p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: b ? JSON.stringify(b) : undefined,
  }).then((r) => r.json());

const browser = await chromium.launch();
let total = 0;

/**
 * Wait for entrance animations to finish before measuring.
 *
 * axe computes contrast from the *rendered* colour. An element caught at
 * opacity 0.6 reports its blend with the background, not its own token, so
 * auditing mid-fade produces contrast failures that do not exist once the page
 * settles - and, worse, they come and go depending on machine speed.
 */
async function settle(p) {
  await p
    .waitForFunction(
      () =>
        [...document.querySelectorAll('article, li, [style*="opacity"]')].every(
          (el) => Number(getComputedStyle(el).opacity) >= 0.999,
        ),
      null,
      { timeout: 5000 },
    )
    .catch(() => {});
  await p.waitForTimeout(250);
}

async function audit(p, label) {
  await settle(p);
  await p.addScriptTag({ path: axePath });
  const res = await p.evaluate((o) => window.axe.run(document, o), AXE_OPTS);
  if (res.violations.length === 0) {
    console.log(`  ${label}: clean`);
  } else {
    for (const v of res.violations) {
      total += v.nodes.length;
      console.log(`  ${label}: [${v.impact}] ${v.id} (${v.nodes.length}) - ${v.help}`);
      for (const n of v.nodes.slice(0, 2)) {
        console.log(`      ${n.html.slice(0, 150).replace(/\s+/g, ' ')}`);
        if (n.any?.[0]?.message) console.log(`      -> ${n.any[0].message.slice(0, 180)}`);
      }
    }
  }
}

for (const scheme of ['light', 'dark']) {
  console.log(`\n${'#'.repeat(50)}\n#  ${scheme}\n${'#'.repeat(50)}`);
  const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 1280, height: 900 } });

  await post('/api/dev/reset');

  // --- static pages -------------------------------------------------
  for (const [route, waitFor] of [
    ['/', 'text=Physics - Forces and Motion'],
    ['/admin/roster', 'text=Mathematics'],
    ['/admin/roster/cls_maths', 'text=Confirmed students'],
    ['/race-demo', 'text=Automated race'],
  ]) {
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', (e) => errs.push(String(e)));
    await p.goto(BASE + route, { waitUntil: 'networkidle' });
    await p.waitForSelector(waitFor, { timeout: 8000 });
    console.log(`\n${route}  (console errors: ${errs.length})`);
    await audit(p, 'loaded');
    await p.close();
  }

  // --- booking: pending -> declined ---------------------------------
  {
    const bk = await post('/api/bookings', {
      studentId: 'stu_hamza',
      trialClassId: 'cls_physics',
    });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/bookings/${bk.data.id}`, { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: /Pay .* and confirm/ }).waitFor({ timeout: 15000 });
    console.log(`\n/bookings/[id]`);
    await audit(p, 'pending_payment');

    // The decline path is driven through the API; the checkout no longer
    // exposes test switches. What is audited here is the failed state's UI.
    await post(`/api/bookings/${bk.data.id}/pay`, {
      idempotencyKey: `a11y_decline_${Date.now()}`,
      outcome: 'decline',
    });
    await p.reload({ waitUntil: 'networkidle' });
    await p.waitForSelector('text=Payment failed', { timeout: 10000 });
    await audit(p, 'payment_failed + toast');
    await p.close();
  }

  // --- booking: confirmed -------------------------------------------
  {
    const bk = await post('/api/bookings', {
      studentId: 'stu_ayesha',
      trialClassId: 'cls_physics',
    });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/bookings/${bk.data.id}`, { waitUntil: 'networkidle' });
    await p.getByRole('button', { name: /Pay .* and confirm/ }).click();
    await p.waitForSelector('text=View class roster', { timeout: 10000 });
    await audit(p, 'confirmed');
    await p.close();
  }

  // --- race demo: run a real race, audit the losing state ------------
  {
    const p = await ctx.newPage();
    await p.goto(`${BASE}/race-demo`, { waitUntil: 'networkidle' });
    await p.waitForSelector('text=Automated race');
    await p.getByRole('button', { name: /Fire \d+ concurrent confirms/ }).click();
    await p.waitForSelector('text=/confirmed, \\d+ rejected/', { timeout: 25000 });
    console.log('\n/race-demo (after automated race)');
    await audit(p, 'race complete');

    const logText = await p.getByRole('log').textContent();
    const won = (logText.match(/WON/g) ?? []).length;
    const lost = (logText.match(/lost ·/g) ?? []).length;
    console.log(`      race outcome in UI: ${won} won, ${lost} lost`);
    await p.close();
  }

  await ctx.close();
}

// --- reduced motion: Lenis and Framer must both stand down -----------
{
  console.log(`\n${'#'.repeat(50)}\n#  prefers-reduced-motion: reduce\n${'#'.repeat(50)}`);
  const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await p.waitForSelector('text=Physics - Forces and Motion');

  // Lenis stamps these on <html> when it initialises.
  const html = await p.locator('html').getAttribute('class');
  console.log(`  <html class="${html ?? ''}">  (expect no lenis-* classes)`);

  // Content must be fully opaque, not mid-fade.
  await settle(p);
  const opacity = await p
    .locator('h1')
    .first()
    .evaluate((el) => getComputedStyle(el.closest('div[style]') ?? el).opacity);
  console.log(`  page content opacity: ${opacity} (expect 1)`);

  await audit(p, 'reduced-motion');
  await p.close();
  await ctx.close();
}

await browser.close();
console.log(`\n${'='.repeat(50)}\n  ${total} violating node(s) total\n${'='.repeat(50)}`);
