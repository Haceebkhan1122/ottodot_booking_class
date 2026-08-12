/**
 * Records the video walkthrough footage.
 *
 * ONE continuous take, roughly six minutes, desktop resolution. Silent - the
 * narration is recorded separately by a human, which is what the brief asks for
 * ("screen recording of you running the solution and briefly explaining your
 * approach").
 *
 * Output:
 *   video/walkthrough.webm     the whole thing, 1920x1080
 *   video/chapters.txt         section timestamps, to line the narration up
 *
 * Two things are added on top of the real UI, because a raw Playwright capture
 * renders no mouse pointer and gives a viewer nothing to anchor on:
 *   - a synthetic cursor that travels to each target before the real click
 *   - a caption pill naming the step
 * Both are injected, `pointer-events: none`, and never interact with the app.
 * Captions stay off during the opening, which is silent B-roll for the intro.
 *
 * Usage:  npm run record          (dev server must already be running)
 *         npm run record -- --no-captions
 *
 * Do NOT run `next build` while the dev server is up: it overwrites .next and
 * the running dev server then serves pages with no CSS at all.
 */
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = 'http://localhost:3000';
const OUT = 'video';
const RAW = path.join(OUT, '.raw');

/*
 * Native 1080p desktop.
 *
 * Viewport and video size must match. Playwright only ever scales a page DOWN
 * to fit `size`; it never scales up, so a 1600x900 viewport in a 1920x1080
 * frame is drawn at the top-left with grey padding filling the rest.
 */
const VIEWPORT = { width: 1920, height: 1080 };
const VIDEO_SIZE = { width: 1920, height: 1080 };
const CAPTIONS = !process.argv.includes('--no-captions');

/*
 * Chromium needs a handful of GTK/at-spi shared objects that this machine does
 * not have installed, and installing them needs root. They are unpacked into
 * node_modules/.cache/browser-libs instead. Setting the variable here is enough
 * because the browser is spawned as a child process and inherits this env.
 */
const LIBS = path.resolve('node_modules/.cache/browser-libs');
if (existsSync(LIBS)) {
  process.env.LD_LIBRARY_PATH = [LIBS, process.env.LD_LIBRARY_PATH].filter(Boolean).join(':');
}

/* -------------------------------------------------------------------- */
/* Injected presentation layer                                           */
/* -------------------------------------------------------------------- */

const OVERLAY = () => {
  const install = () => {
    if (document.getElementById('__demo_cursor')) return;
    if (!document.body) return;

    const cursor = document.createElement('div');
    cursor.id = '__demo_cursor';
    cursor.style.cssText = [
      'position:fixed;left:0;top:0;width:22px;height:22px;border-radius:50%',
      'background:rgba(79,70,229,.30);border:2px solid #4f46e5',
      'box-shadow:0 0 0 6px rgba(79,70,229,.13)',
      'pointer-events:none;z-index:2147483647',
      'transform:translate(-300px,-300px)',
      'transition:transform .5s cubic-bezier(.22,1,.36,1);will-change:transform',
    ].join(';');
    document.body.appendChild(cursor);

    const caption = document.createElement('div');
    caption.id = '__demo_caption';
    caption.style.cssText = [
      'position:fixed;left:32px;bottom:32px;max-width:62ch',
      'padding:13px 22px;border-radius:14px',
      'background:rgba(15,15,22,.92);color:#fff',
      'font:500 17px/1.5 ui-sans-serif,system-ui,-apple-system,sans-serif',
      'letter-spacing:.01em;pointer-events:none;z-index:2147483647',
      'opacity:0;transition:opacity .35s ease;box-shadow:0 10px 34px rgba(0,0,0,.38)',
    ].join(';');
    document.body.appendChild(caption);
  };

  window.__demoMove = (x, y) => {
    const c = document.getElementById('__demo_cursor');
    if (c) c.style.transform = `translate(${x - 11}px,${y - 11}px)`;
  };
  window.__demoPing = () => {
    const c = document.getElementById('__demo_cursor');
    if (!c) return;
    c.animate(
      [
        { boxShadow: '0 0 0 6px rgba(79,70,229,.13)' },
        { boxShadow: '0 0 0 20px rgba(79,70,229,0)' },
      ],
      { duration: 520, easing: 'ease-out' },
    );
  };
  window.__demoSay = (text) => {
    const c = document.getElementById('__demo_caption');
    if (!c) return;
    if (!text) {
      c.style.opacity = '0';
      return;
    }
    c.textContent = text;
    c.style.opacity = '1';
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else {
    install();
  }
};

/* -------------------------------------------------------------------- */
/* Driving helpers                                                       */
/* -------------------------------------------------------------------- */

const wait = (p, ms) => p.waitForTimeout(ms);

async function say(p, text, hold = 0) {
  if (CAPTIONS) await p.evaluate((t) => window.__demoSay?.(t), text).catch(() => {});
  if (hold) await wait(p, hold);
}

/**
 * Wait for Lenis to finish easing.
 *
 * Lenis animates scrollTop on a rAF loop with an asymptotic ease, so an element
 * that has just been scrolled into view keeps drifting by sub-pixel amounts for
 * a long time. Playwright's actionability check reads that as "not stable" and
 * can sit on a click for minutes - it did, and it put three frozen minutes in
 * the middle of an early take. Settle the scroll here, then click by coordinate
 * so no stability check is involved.
 */
async function settleScroll(p, tries = 60) {
  let last = null;
  for (let i = 0; i < tries; i += 1) {
    const y = await p.evaluate(() => Math.round(window.scrollY)).catch(() => 0);
    if (y === last) return;
    last = y;
    await wait(p, 100);
  }
}

async function point(p, locator, dwell = 700) {
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await settleScroll(p);
  const box = await locator.boundingBox();
  if (!box) return null;
  await p
    .evaluate(([x, y]) => window.__demoMove?.(x, y), [box.x + box.width / 2, box.y + box.height / 2])
    .catch(() => {});
  await wait(p, dwell);
  return box;
}

async function click(p, locator) {
  await locator.waitFor({ state: 'visible' });

  // isEnabled() honours aria-disabled, which is what this app uses for
  // in-flight buttons rather than the disabled attribute.
  for (let i = 0; i < 60 && !(await locator.isEnabled().catch(() => false)); i += 1) {
    await wait(p, 200);
  }

  const box = (await point(p, locator)) ?? (await locator.boundingBox());
  await p.evaluate(() => window.__demoPing?.()).catch(() => {});
  await wait(p, 200);
  if (box) await p.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  else await locator.click({ force: true });
  await wait(p, 500);
}

/**
 * Book a class and land on the payment screen.
 *
 * Retries once. In dev, a hot recompile can land between the click and the
 * navigation and quietly swallow the first one - harmless for a person, fatal
 * for an unattended take.
 */
async function bookInto(p, subject) {
  const button = p.locator('article', { hasText: subject }).getByRole('button', { name: /Book for/ });
  await click(p, button);
  try {
    await p.waitForURL(/\/bookings\//, { timeout: 20_000 });
  } catch {
    await button.click({ timeout: 10_000 }).catch(() => {});
    await p.waitForURL(/\/bookings\//, { timeout: 25_000 });
  }
  await p.getByRole('button', { name: /Pay .* and confirm/ }).waitFor();
}

async function selectFamily(p, parentId, studentId) {
  await p.waitForSelector('#parent-select');
  await point(p, p.locator('#parent-select'), 500);
  await p.selectOption('#parent-select', parentId);
  await wait(p, 800);
  if (studentId) {
    await point(p, p.locator('#student-select'), 500);
    await p.selectOption('#student-select', studentId);
    await wait(p, 800);
  }
}

async function glide(p, amount = 320, steps = 3, gap = 700) {
  for (let i = 0; i < steps; i += 1) {
    await p.mouse.wheel(0, amount);
    await wait(p, gap);
  }
}

const api = (method, pathname, body) =>
  fetch(BASE + pathname, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));

const reset = () => api('POST', '/api/dev/reset');

/* -------------------------------------------------------------------- */
/* Chapter log                                                           */
/* -------------------------------------------------------------------- */

const chapters = [];
let clock = 0;

const stamp = (title) => {
  const s = Math.round((Date.now() - clock) / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  chapters.push(`${mm}:${ss}  ${title}`);
  console.log(`  ${mm}:${ss}  ${title}`);
};

/* -------------------------------------------------------------------- */

await rm(OUT, { recursive: true, force: true });
await mkdir(RAW, { recursive: true });

const browser = await chromium.launch();

/* ==================================================================== */
/* Warm up. Next.js compiles routes on first request in dev; doing that  */
/* inside the take would put blank seconds in the middle of the video.   */
/* ==================================================================== */
console.log('Warming routes…');
{
  await reset();
  const warm = await browser.newContext({ viewport: VIEWPORT });
  warm.setDefaultTimeout(120_000);
  const p = await warm.newPage();
  const routes = [
    '/',
    '/admin/roster',
    '/admin/roster/cls_physics',
    '/admin/roster/cls_maths',
    '/race-demo',
    '/api/classes',
    '/api/roster/cls_physics',
  ];
  for (const route of routes) {
    await p.goto(BASE + route, { waitUntil: 'networkidle', timeout: 120_000 }).catch(() => {});
  }
  const seed = await api('POST', '/api/bookings', { studentId: 'stu_bilal', trialClassId: 'cls_biology' });
  if (seed.body?.data?.id) {
    await p.goto(`${BASE}/bookings/${seed.body.data.id}`, { waitUntil: 'networkidle' }).catch(() => {});
  }
  await warm.close();
}

/* ==================================================================== */
/* The take                                                              */
/* ==================================================================== */
console.log('\nRecording (single take, ~6 min)…');

const ctx = await browser.newContext({
  viewport: VIEWPORT,
  recordVideo: { dir: RAW, size: VIDEO_SIZE },
  reducedMotion: 'no-preference',
});
ctx.setDefaultTimeout(60_000);
await ctx.addInitScript(OVERLAY);
const p = await ctx.newPage();

await reset();
clock = Date.now();

/* ---- 0:00 Opening. Silent B-roll: the narrator is introducing himself. */
await p.goto(BASE, { waitUntil: 'networkidle' });
await p.locator('article', { hasText: 'Physics' }).waitFor();
stamp('OPENING — talk about yourself over this');
await wait(p, 7000);

await glide(p, 240, 4, 1400);
await wait(p, 4000);
await glide(p, 260, 3, 1400);
await wait(p, 5000);
await p.mouse.wheel(0, -1400);
await wait(p, 3500);
await glide(p, 300, 2, 1500);
await wait(p, 6000);
await p.mouse.wheel(0, -1200);
await wait(p, 5000);

/* ---- 0:50 What the task is ---------------------------------------- */
stamp('What the task is — four classes, capacity 4');
await say(p, 'Four trial classes. Every one of them is capped at four students.', 4500);

const maths = p.locator('article', { hasText: 'Mathematics' });
await point(p, maths);
await say(p, 'Mathematics is at 3 of 4 — one seat left. This is where the race happens.', 5500);
await point(p, maths.getByText(/not held for you until payment succeeds/));
await say(p, 'The card says it outright: choosing a class does not hold the seat.', 5000);

const chem = p.locator('article', { hasText: 'Chemistry' });
await point(p, chem);
await say(p, 'Chemistry is full, so it offers no Book button at all.', 4200);

/* ---- 1:20 Stack: it is a real HTTP API ----------------------------- */
stamp('Stack — route handlers, a real HTTP API');
await say(p, '', 400);

/**
 * Chromium's built-in JSON viewer renders one unbroken line in a tiny
 * monospace face - unreadable once YouTube has compressed it. Its own
 * Pretty-print toggle fixes the wrapping; the font size is ours.
 */
async function showJson(url) {
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await wait(p, 900);
  await p.locator('input[type="checkbox"]').first().check({ timeout: 5000 }).catch(() => {});
  await p
    .evaluate(() => {
      document.querySelectorAll('pre').forEach((el) => {
        el.style.fontSize = '18px';
        el.style.lineHeight = '1.65';
      });
    })
    .catch(() => {});
  // The JSON viewer rebuilds <body> after our init script has run, taking the
  // cursor and caption with it. Put them back.
  await p.evaluate(OVERLAY).catch(() => {});
  await wait(p, 1200);
}

await showJson(`${BASE}/api/classes`);
await say(p, 'Route handlers, not server actions. Every endpoint has a URL you can curl.', 7000);
await glide(p, 220, 2, 1000);
await wait(p, 3000);

await showJson(`${BASE}/api/roster/cls_maths`);
await say(p, 'This is the roster API the brief asks for. Plain JSON, no framework protocol.', 7000);
await glide(p, 220, 2, 1000);
await wait(p, 3000);

/* ---- 2:00 Booking flow --------------------------------------------- */
stamp('Booking — pending_payment holds no seat');
await p.goto(BASE, { waitUntil: 'networkidle' });
await say(p, 'Sana Iqbal is the family we open on. She holds nothing yet.', 4000);
await selectFamily(p, 'par_sana', 'stu_aisha');

await say(p, 'Booking her daughter Aisha into Physics.', 2500);
await bookInto(p, 'Physics');
await wait(p, 1500);

await say(p, 'Status is pending_payment.', 3000);
await point(p, p.getByText(/not held yet/).first());
await say(p, 'Read the line underneath: the seat is NOT held yet.', 5000);

stamp('Payment — confirmed, and captured');
await say(p, 'One saved card, one Pay button.', 3000);
await click(p, p.getByRole('button', { name: /Pay .* and confirm/ }));
await p.getByText('Confirmed').first().waitFor();
await wait(p, 2500);
await say(p, 'Confirmed.', 3000);
await glide(p, 280, 2, 800);
await point(p, p.getByText('Captured').first());
await say(p, 'And the history records a Captured payment. Every seat has money behind it.', 6000);

/* ---- 2:55 Roster ---------------------------------------------------- */
stamp('Roster — the teacher view');
await p.goto(`${BASE}/admin/roster`, { waitUntil: 'networkidle' });
await wait(p, 2000);
await say(p, 'The teacher roster. Physics moved to 2 of 4.', 4500);
await click(p, p.locator('a', { hasText: 'Physics' }).first());
await wait(p, 2500);
await say(p, 'Only confirmed bookings appear here. Nothing else takes a seat.', 5500);
await glide(p, 250, 2, 900);
await wait(p, 2500);

/* ---- 3:25 Duplicate -------------------------------------------------- */
stamp('Duplicate — refused by the database, not the UI');
await p.goto(BASE, { waitUntil: 'networkidle' });
await selectFamily(p, 'par_sana', 'stu_bilal');
await say(p, 'Switching to Bilal. This tab believes he has no Physics booking.', 5000);

// Create one out of band, so the screen is deliberately stale. This is the
// honest version of the duplicate test: the client cannot be the guard.
await api('POST', '/api/bookings', { studentId: 'stu_bilal', trialClassId: 'cls_physics' });
await say(p, 'Another device just booked him into Physics. This tab has no idea.', 5000);

await click(p, p.locator('article', { hasText: 'Physics' }).getByRole('button', { name: /Book for/ }));
await p.getByText(/already has an active booking/).first().waitFor();
await wait(p, 1500);
await say(p, 'Refused. Not by a check in the browser — the browser was out of date.', 5500);
await point(p, p.getByRole('link', { name: 'Open existing booking' }).first());
await say(p, 'A partial unique index in Postgres rejected it, and the UI reported that honestly.', 6500);

/* ---- 4:00 Payment failure -------------------------------------------- */
stamp('Payment failure — no seat, no charge, retry allowed');
const failed = await api('POST', '/api/bookings', {
  studentId: 'stu_aisha',
  trialClassId: 'cls_biology',
});
await api('POST', `/api/bookings/${failed.body.data.id}/pay`, {
  idempotencyKey: `demo_decline_${Date.now()}`,
  outcome: 'decline',
});
await p.goto(`${BASE}/bookings/${failed.body.data.id}`, { waitUntil: 'networkidle' });
await p.getByText('Payment failed').first().waitFor();
await wait(p, 2000);
await say(p, 'A declined card. Status is payment_failed.', 4500);
await glide(p, 260, 2, 900);
await point(p, p.getByText('Declined').first());
await say(p, 'The history says Declined. No seat taken, nothing charged.', 5500);
await p.mouse.wheel(0, -700);
await settleScroll(p);
const retry = p.getByRole('button', { name: 'Try again' });
if (await retry.count()) await point(p, retry);
await say(p, 'And the parent can just try again — failed rows sit outside the uniqueness rule.', 6500);

/* ---- 4:30 Cancelled, the fourth status -------------------------------- */
stamp('Cancelled — the only status a human sets');
const pending = await api('POST', '/api/bookings', {
  studentId: 'stu_bilal',
  trialClassId: 'cls_maths',
});
await p.goto(`${BASE}/bookings/${pending.body.data.id}`, { waitUntil: 'networkidle' });
await wait(p, 1500);
await say(p, 'The fourth status. Cancelled is set by a person, never by the system.', 3000);

// Bring the action into frame first - it sits below the fold on this page.
await glide(p, 320, 2, 900);
await wait(p, 2500);
const cancelBtn = p.getByRole('button', { name: /Cancel and free this child|Cancel this booking/ });
await click(p, cancelBtn);
/*
 * Wait for the status panel itself, not the word "Cancelled".
 *
 * A toast carrying that word lands before the panel refetches, so matching on
 * the bare word scrolled the page back up while the badge still read "Awaiting
 * payment" and the button was mid-spinner.
 */
await p.getByText(/was cancelled and the seat returned/i).first().waitFor();
await wait(p, 1500);
await p.mouse.wheel(0, -900);
await settleScroll(p);
await say(p, 'That keeps each status meaning exactly one thing.', 5500);
await wait(p, 2000);

/* ---- 4:50 The last-seat race ------------------------------------------ */
stamp('THE LAST-SEAT RACE');
await p.goto(`${BASE}/race-demo`, { waitUntil: 'networkidle' });
await wait(p, 1800);
await say(p, 'Now the part that matters. Two parents, one seat.', 4500);

await click(p, p.getByRole('button', { name: /Reset demo data/ }));
await wait(p, 2500);
await say(p, 'Mathematics: three confirmed, one seat left.', 4000);

const createButtons = p.getByRole('button', { name: /1 · Create booking/ });
await say(p, 'Parent A creates a booking.', 2200);
await click(p, createButtons.nth(0));
await wait(p, 1800);
await say(p, 'Parent B creates one too.', 2200);
await click(p, createButtons.nth(1));
await wait(p, 2000);

stamp('Both pending — counter still 3 of 4');
await say(
  p,
  'Both are pending, and the counter is STILL three of four. A pending booking holds nothing — that is what makes a real race possible.',
  8000,
);

stamp('Both press Pay on the same tick');
await say(p, 'Now both press Pay in the same tick.', 3500);
await click(p, p.getByRole('button', { name: /Both pay at the same instant/ }));
await p.getByText(/WON the seat/).first().waitFor();
await p.getByText(/LOST the seat/).first().waitFor();
await wait(p, 2500);

await say(p, 'One WON. One lost with class_full. Never both.', 5000);
await glide(p, 300, 2, 900);
await point(p, p.getByText(/WON the seat/).first());
await wait(p, 3500);
await point(p, p.getByText(/LOST the seat/).first());
await say(p, 'The loser was authorised, then voided. The card was fine — the seat was gone.', 6500);

// Dwell on the claim itself: this is the frame to talk the SQL over.
await say(p, 'This is the statement that decides it. One row, one lock, one winner.', 2500);
await point(p, p.getByText(/update trial_classes set confirmed_count/).first());
await wait(p, 9000);

/* ---- 5:45 Ten at once -------------------------------------------------- */
stamp('Ten concurrent confirms on one seat');
await p.mouse.wheel(0, -1000);
await settleScroll(p);
await click(p, p.getByRole('button', { name: /Reset demo data/ }));
await wait(p, 2500);
await say(p, 'Two racers could be luck. Ten is not.', 4000);
await click(p, p.getByRole('button', { name: /Fire \d+ concurrent confirms/ }));
await p.getByText(/expected exactly 1/).first().waitFor();
await wait(p, 2200);
await glide(p, 300, 2, 900);
await point(p, p.getByText(/expected exactly 1/).first());
await say(p, 'Ten parents, one seat. Exactly one winner, nine rejected.', 6500);

/* ---- 6:05 Proof on the roster ------------------------------------------ */
stamp('Roster proves it — exactly 4');
await p.goto(`${BASE}/admin/roster/cls_maths`, { waitUntil: 'networkidle' });
await wait(p, 2200);
await say(p, 'And the roster agrees: exactly four students. Never five.', 6000);
await glide(p, 240, 2, 1000);
await wait(p, 4000);
await say(p, '', 800);
await wait(p, 2000);

const video = p.video();
await ctx.close();
await video.saveAs(path.join(OUT, 'walkthrough.webm'));

await writeFile(path.join(OUT, 'chapters.txt'), `${chapters.join('\n')}\n`, 'utf8');

await browser.close();
await rm(RAW, { recursive: true, force: true });
await reset();

console.log(`\n  saved ${OUT}/walkthrough.webm`);
console.log('  chapters written to video/chapters.txt');
console.log('  database reset to the seed state\n');
