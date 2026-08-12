const BASE = 'http://localhost:3000/api';

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${detail}`); }
};

const api = async (method, path, body) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const reset = () => api('POST', '/dev/reset');
const klass = async (id) => (await api('GET', `/classes/${id}`)).body.data;
const key = (p) => `${p}_${Math.random().toString(36).slice(2)}`;

// ---------------------------------------------------------------
console.log('\n[1] Duplicate booking for the same child and class');
await reset();
{
  // Ayesha is already confirmed in Biology per the seed.
  const r = await api('POST', '/bookings', { studentId: 'stu_ayesha', trialClassId: 'cls_biology' });
  check('rejected with 409', r.status === 409, `got ${r.status}`);
  check('reason is duplicate_active_booking', r.body?.reason === 'duplicate_active_booking', JSON.stringify(r.body));

  // A pending booking must also block a second one.
  const first = await api('POST', '/bookings', { studentId: 'stu_bilal', trialClassId: 'cls_biology' });
  check('first pending booking created', first.status === 201, `got ${first.status}`);
  const second = await api('POST', '/bookings', { studentId: 'stu_bilal', trialClassId: 'cls_biology' });
  check('pending also blocks a duplicate', second.status === 409 && second.body?.reason === 'duplicate_active_booking');
}

// ---------------------------------------------------------------
console.log('\n[2] Payment failure never touches the roster');
await reset();
{
  const before = await klass('cls_physics');
  const b = await api('POST', '/bookings', { studentId: 'stu_aisha', trialClassId: 'cls_physics' });
  const pay = await api('POST', `/bookings/${b.body.data.id}/pay`, { idempotencyKey: key('k'), outcome: 'decline' });

  check('pay returns 402', pay.status === 402, `got ${pay.status}`);
  check('reason is payment_declined', pay.body?.reason === 'payment_declined');

  const after = await klass('cls_physics');
  check('confirmedCount unchanged', after.confirmedCount === before.confirmedCount,
    `${before.confirmedCount} -> ${after.confirmedCount}`);

  const detail = (await api('GET', `/bookings/${b.body.data.id}`)).body.data;
  check('booking status is payment_failed', detail.status === 'payment_failed', detail.status);

  const roster = (await api('GET', '/roster/cls_physics')).body.data;
  check('child absent from confirmed roster',
    !roster.confirmed.some((e) => e.studentName === 'Aisha Iqbal'));

  // A declined booking must not block a retry.
  const retry = await api('POST', '/bookings', { studentId: 'stu_aisha', trialClassId: 'cls_physics' });
  check('retry after decline is allowed', retry.status === 201, `got ${retry.status}`);
}

// ---------------------------------------------------------------
console.log('\n[3] Last-seat race — the scenario from the brief');
await reset();
{
  const before = await klass('cls_maths');
  check('stage has exactly 1 seat', before.seatsRemaining === 1, `${before.seatsRemaining}`);

  // A and B both reach payment. Neither booking holds a seat.
  const a = (await api('POST', '/bookings', { studentId: 'stu_aisha', trialClassId: 'cls_maths' })).body.data;
  const b = (await api('POST', '/bookings', { studentId: 'stu_bilal', trialClassId: 'cls_maths' })).body.data;
  check('both bookings created for one seat', Boolean(a?.id && b?.id));

  // A starts a slow authorisation; B pays instantly and wins mid-flight.
  const aPay = api('POST', `/bookings/${a.id}/pay`, { idempotencyKey: key('a'), outcome: 'slow' });
  await new Promise((r) => setTimeout(r, 300));
  const bPay = await api('POST', `/bookings/${b.id}/pay`, { idempotencyKey: key('b'), outcome: 'success' });
  const aResult = await aPay;

  check('B confirmed', bPay.status === 200, `got ${bPay.status}`);
  check('A rejected with 409', aResult.status === 409, `got ${aResult.status}`);
  check('A reason is class_full', aResult.body?.reason === 'class_full', JSON.stringify(aResult.body));

  const aDetail = (await api('GET', `/bookings/${a.id}`)).body.data;
  check('A is payment_failed with reason class_full, not payment_declined',
    aDetail.status === 'payment_failed' && aDetail.failureReason === 'class_full',
    `${aDetail.status}/${aDetail.failureReason}`);
  check('A authorisation was voided, never captured',
    aDetail.paymentAttempts.every((p) => p.result !== 'captured') &&
    aDetail.paymentAttempts.some((p) => p.result === 'voided'),
    JSON.stringify(aDetail.paymentAttempts.map((p) => p.result)));

  const after = await klass('cls_maths');
  check('class ends exactly at capacity', after.confirmedCount === after.capacity,
    `${after.confirmedCount}/${after.capacity}`);
}

// ---------------------------------------------------------------
console.log('\n[4] N-way race — only the open seats can be won');
for (const round of [1, 2, 3]) {
  await reset();
  const before = await klass('cls_maths');
  const students = ['stu_aisha', 'stu_bilal', 'stu_yusuf',
    ...Array.from({ length: 8 }, (_, i) => `stu_fixture_${i + 1}`)];

  const bookings = [];
  for (const s of students) {
    const r = await api('POST', '/bookings', { studentId: s, trialClassId: 'cls_maths' });
    if (r.status === 201) bookings.push(r.body.data.id);
  }

  const results = await Promise.all(
    bookings.map((id) => api('POST', `/bookings/${id}/pay`, { idempotencyKey: key('r'), outcome: 'success' })),
  );

  const winners = results.filter((r) => r.status === 200).length;
  const full = results.filter((r) => r.body?.reason === 'class_full').length;
  const after = await klass('cls_maths');

  check(`round ${round}: ${bookings.length} racers, exactly ${before.seatsRemaining} winner`,
    winners === before.seatsRemaining, `winners=${winners}`);
  check(`round ${round}: every loser got class_full`, full === bookings.length - winners,
    `full=${full} of ${bookings.length - winners}`);
  check(`round ${round}: never exceeded capacity`, after.confirmedCount <= after.capacity,
    `${after.confirmedCount}/${after.capacity}`);
}

// ---------------------------------------------------------------
console.log('\n[5] Idempotency — a replayed payment does not charge twice');
await reset();
{
  const b = (await api('POST', '/bookings', { studentId: 'stu_aisha', trialClassId: 'cls_physics' })).body.data;
  const k = key('idem');
  const before = await klass('cls_physics');

  const [one, two] = await Promise.all([
    api('POST', `/bookings/${b.id}/pay`, { idempotencyKey: k, outcome: 'success' }),
    new Promise((r) => setTimeout(r, 120)).then(() =>
      api('POST', `/bookings/${b.id}/pay`, { idempotencyKey: k, outcome: 'success' })),
  ]);

  check('both replays return 200', one.status === 200 && two.status === 200, `${one.status}/${two.status}`);

  const after = await klass('cls_physics');
  check('seat taken exactly once', after.confirmedCount === before.confirmedCount + 1,
    `${before.confirmedCount} -> ${after.confirmedCount}`);

  const detail = (await api('GET', `/bookings/${b.id}`)).body.data;
  check('exactly one captured attempt',
    detail.paymentAttempts.filter((p) => p.result === 'captured').length === 1,
    JSON.stringify(detail.paymentAttempts.map((p) => p.result)));
}

// ---------------------------------------------------------------
console.log('\n[6] Full class refuses new bookings');
await reset();
{
  const r = await api('POST', '/bookings', { studentId: 'stu_aisha', trialClassId: 'cls_chemistry' });
  check('rejected with 409 class_full', r.status === 409 && r.body?.reason === 'class_full',
    `${r.status} ${r.body?.reason}`);
}

// ---------------------------------------------------------------
console.log('\n[7] Cancellation returns the seat');
await reset();
{
  const before = await klass('cls_physics');
  const b = (await api('POST', '/bookings', { studentId: 'stu_aisha', trialClassId: 'cls_physics' })).body.data;
  await api('POST', `/bookings/${b.id}/pay`, { idempotencyKey: key('c'), outcome: 'success' });
  const mid = await klass('cls_physics');
  check('seat taken', mid.confirmedCount === before.confirmedCount + 1);

  await api('POST', `/bookings/${b.id}/cancel`);
  const after = await klass('cls_physics');
  check('seat returned', after.confirmedCount === before.confirmedCount,
    `${after.confirmedCount} vs ${before.confirmedCount}`);
}

await reset();
console.log(`\n${'='.repeat(46)}\n  ${pass} passed, ${fail} failed\n${'='.repeat(46)}`);
process.exit(fail === 0 ? 0 : 1);
