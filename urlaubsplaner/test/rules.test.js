import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as r from '../api/rules.js';

const FULL = r.FULL_WEEK;

test('Easter Sunday 2024–2030', () => {
  const expected = {
    2024: '2024-03-31', 2025: '2025-04-20', 2026: '2026-04-05', 2027: '2027-03-28',
    2028: '2028-04-16', 2029: '2029-04-01', 2030: '2030-04-21',
  };
  for (const [y, d] of Object.entries(expected)) assert.equal(r.easterSunday(Number(y)), d);
});

test('Austrian public holidays 2026, complete list', () => {
  assert.deepEqual(r.publicHolidays(2026).map((h) => h.date), [
    '2026-01-01', '2026-01-06', '2026-04-06', '2026-05-01', '2026-05-14', '2026-05-25',
    '2026-06-04', '2026-08-15', '2026-10-26', '2026-11-01', '2026-12-08', '2026-12-25',
    '2026-12-26',
  ]);
});

test('moving holidays 2024–2030 (Easter Monday, Ascension, Whit Monday, Corpus Christi)', () => {
  const expected = {
    2024: ['2024-04-01', '2024-05-09', '2024-05-20', '2024-05-30'],
    2025: ['2025-04-21', '2025-05-29', '2025-06-09', '2025-06-19'],
    2026: ['2026-04-06', '2026-05-14', '2026-05-25', '2026-06-04'],
    2027: ['2027-03-29', '2027-05-06', '2027-05-17', '2027-05-27'],
    2028: ['2028-04-17', '2028-05-25', '2028-06-05', '2028-06-15'],
    2029: ['2029-04-02', '2029-05-10', '2029-05-21', '2029-05-31'],
    2030: ['2030-04-22', '2030-05-30', '2030-06-10', '2030-06-20'],
  };
  for (const [y, dates] of Object.entries(expected)) {
    const names = ['Ostermontag', 'Christi Himmelfahrt', 'Pfingstmontag', 'Fronleichnam'];
    const got = names.map((n) => r.publicHolidays(Number(y)).find((h) => h.name === n).date);
    assert.deepEqual(got, dates, `year ${y}`);
  }
});

test('13 holidays every year; Good Friday, 24 and 31 Dec are working days', () => {
  for (let y = 2024; y <= 2030; y++) assert.equal(r.publicHolidays(y).length, 13);
  assert.equal(r.holidayName('2026-04-03'), ''); // Karfreitag
  assert.equal(r.holidayName('2026-12-24'), '');
  assert.equal(r.holidayName('2026-12-31'), '');
  assert.equal(r.holidayName('2026-10-26'), 'Nationalfeiertag');
});

test('date helpers', () => {
  assert.equal(r.isIsoDate('2026-02-29'), false);
  assert.equal(r.isIsoDate('2028-02-29'), true);
  assert.equal(r.isIsoDate('2026-1-5'), false);
  assert.equal(r.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(r.spanDays('2026-08-03', '2026-08-07'), 5);
  assert.equal(r.weekdayOf('2026-10-14'), 'wed');
  assert.equal(r.formatRange('2026-08-03', '2026-08-07'), '3. August bis 7. August 2026');
  assert.equal(r.formatDay('2027-01-04'), '4. Jänner 2027');
});

test('today is computed in Vienna, not UTC', () => {
  assert.equal(r.todayIn('Europe/Vienna', new Date('2026-10-14T22:30:00Z')), '2026-10-15');
  assert.equal(r.todayIn('Europe/Vienna', new Date('2026-12-31T22:59:00Z')), '2026-12-31');
  assert.equal(r.todayIn('Europe/Vienna', new Date('2026-12-31T23:00:00Z')), '2027-01-01');
});

test('counting: full week, part-time pattern, holiday, half day', () => {
  const week = { start: '2026-08-03', end: '2026-08-09' };
  assert.equal(r.countEntry(week, FULL).total, 5);
  assert.equal(r.countEntry(week, ['mon', 'tue', 'thu']).total, 3);
  // Thursday 14 May 2026 is Ascension
  assert.equal(r.countEntry({ start: '2026-05-11', end: '2026-05-15' }, FULL).total, 4);
  assert.equal(r.countEntry({ start: '2026-08-04', end: '2026-08-04', half: 'am' }, FULL).total, 0.5);
  assert.equal(r.countEntry({ start: '2026-08-08', end: '2026-08-09' }, FULL).total, 0);
});

test('counting: an entry over New Year is split per year', () => {
  const e = { start: '2026-12-28', end: '2027-01-08' };
  assert.deepEqual(r.countEntry(e, FULL), { total: 8, byYear: { 2026: 4, 2027: 4 } });
});

test('counting: closure days are not vacation days', () => {
  const closures = [{ kind: 'closure', status: 'approved', start: '2026-12-28', end: '2026-12-31' }];
  const closed = r.closureDays(closures);
  assert.equal(r.countEntry({ start: '2026-12-28', end: '2027-01-05' }, FULL, closed).total, 2);
  // a pending closure does not close anything
  const pending = r.closureDays([{ ...closures[0], status: 'pending' }]);
  assert.equal(pending.size, 0);
});

test('allowance: 25 days on 5 days, scaled for part-time, overrides win', () => {
  assert.equal(r.defaultAllowance(FULL), 25);
  assert.equal(r.defaultAllowance(['mon', 'tue', 'wed', 'thu']), 20);
  assert.equal(r.defaultAllowance(['mon', 'tue', 'thu']), 15);
  assert.equal(r.defaultAllowance(['mon']), 5);
  assert.equal(r.allowanceFor({ workPattern: FULL, allowances: { 2026: 27.5 } }, 2026), 27.5);
  assert.equal(r.allowanceFor({ workPattern: FULL, allowances: { 2025: 30 } }, 2026), 25);
});

test('balance: taken before today, planned from today, pending separate', () => {
  const person = { workPattern: FULL, carryOver: { 2026: 3 } };
  const entries = [
    { kind: 'vacation', status: 'approved', start: '2026-02-16', end: '2026-02-17' }, // 2 taken, uses carry-over
    { kind: 'vacation', status: 'approved', start: '2026-08-03', end: '2026-08-07' }, // 5 taken
    { kind: 'vacation', status: 'approved', start: '2026-10-12', end: '2026-10-16' }, // 2 taken, 3 planned
    { kind: 'vacation', status: 'approved', start: '2026-12-28', end: '2027-01-08' }, // 4 planned in 2026
    { kind: 'vacation', status: 'pending', start: '2026-11-02', end: '2026-11-03' }, // 2 pending
    { kind: 'vacation', status: 'declined', start: '2026-11-09', end: '2026-11-13' }, // nothing
    { kind: 'absence', status: 'approved', start: '2026-09-07', end: '2026-09-11' }, // nothing
  ];
  // 3 carried over, 2 used by 31 March, 1 expired
  assert.deepEqual(r.balance({ person, year: 2026, today: '2026-10-14', entries }), {
    year: 2026, allowance: 25, carryOver: 3, carryOverExpires: '2026-03-31', carryOverExpired: 1,
    total: 27, taken: 9, planned: 7, pending: 2, remaining: 11,
  });
  const next = r.balance({ person, year: 2027, today: '2026-10-14', entries });
  assert.equal(next.planned, 4);
  assert.equal(next.remaining, 21);
});

test('balance: carry-over counts fully until 31 March, then only what was used', () => {
  const person = { workPattern: FULL, carryOver: { 2026: 5 } };
  const entries = [{ kind: 'vacation', status: 'approved', start: '2026-03-30', end: '2026-04-03' }]; // 2 before, 3 after
  const before = r.balance({ person, year: 2026, today: '2026-02-01', entries });
  assert.equal(before.total, 30);
  assert.equal(before.carryOverExpired, 0);
  assert.equal(r.balance({ person, year: 2026, today: '2026-03-31', entries }).carryOverExpired, 0);
  const after = r.balance({ person, year: 2026, today: '2026-04-01', entries });
  assert.equal(after.carryOverExpired, 3);
  assert.equal(after.total, 27);
  assert.equal(after.remaining, 22);
});

test('balance: closures that count as vacation cost the person their own working days', () => {
  const person = { workPattern: ['mon', 'tue', 'thu'] };
  const closures = [{
    kind: 'closure', status: 'approved', countsAsVacation: true, start: '2026-12-28', end: '2027-01-01',
  }];
  const b = r.balance({ person, year: 2026, today: '2026-10-14', entries: [], closures });
  assert.equal(b.allowance, 15);
  assert.equal(b.planned, 3); // Mon 28, Tue 29, Thu 31
  assert.equal(b.remaining, 12);
});

test('validation: dates, span, half days, note', () => {
  const v = (x) => r.validateEntry({ kind: 'vacation', ...x }).error;
  assert.match(v({ start: 'morgen' }), /gültiges Startdatum/);
  assert.match(v({ start: '2026-08-07', end: '2026-08-03' }), /vor dem Startdatum/);
  assert.match(v({ start: '2019-12-30', end: '2020-01-03' }), /zwischen 2020 und 2040/);
  assert.match(v({ start: '2040-12-31', end: '2041-01-02' }), /zwischen 2020 und 2040/);
  assert.match(v({ start: '2026-06-01', end: '2026-09-01' }), /höchstens 92 Tage/);
  assert.equal(v({ start: '2026-06-01', end: '2026-08-31' }), undefined);
  assert.match(v({ start: '2026-08-03', end: '2026-08-04', half: 'am' }), /selben Datum/);
  assert.match(v({ start: '2026-08-03', half: 'evening' }), /Vormittag oder Nachmittag/);
  assert.match(v({ start: '2026-08-03', note: 'x'.repeat(301) }), /300 Zeichen/);
  assert.match(r.validateEntry({ kind: 'sick', start: '2026-08-03' }).error, /Urlaub oder/);
  assert.match(r.validateEntry({ kind: 'absence', start: '2026-08-03' }).error, /Grund/);
});

test('validation: end defaults to start, text is trimmed', () => {
  const { value } = r.validateEntry({ kind: 'absence', reason: 'training', start: '2026-08-08', note: '  Kurs ' });
  assert.deepEqual(value, {
    kind: 'absence', reason: 'training', start: '2026-08-08', end: '2026-08-08', half: '', note: 'Kurs',
  });
});

test('validation: vacation only on free days has nothing to book', () => {
  const err = r.validateEntry({ kind: 'vacation', start: '2026-08-08', end: '2026-08-09' }).error;
  assert.match(err, /nichts zu buchen/);
  assert.match(r.validateEntry({ kind: 'vacation', start: '2026-12-25' }).error, /nichts zu buchen/);
  assert.match(
    r.validateEntry({ kind: 'vacation', start: '2026-08-05' }, { pattern: ['mon', 'tue', 'thu'] }).error,
    /nichts zu buchen/,
  );
  // other absences may sit on a free day
  assert.equal(r.validateEntry({ kind: 'absence', reason: 'conference', start: '2026-08-08' }).error, undefined);
});

test('validation: no overlap with own entries, except morning + afternoon', () => {
  const existing = [
    { id: 'a', status: 'approved', start: '2026-08-03', end: '2026-08-07', half: '' },
    { id: 'b', status: 'pending', start: '2026-09-01', end: '2026-09-01', half: 'am' },
    { id: 'c', status: 'declined', start: '2026-10-05', end: '2026-10-09', half: '' },
  ];
  const v = (x, id) => r.validateEntry({ kind: 'vacation', ...x }, { existing, id }).error;
  assert.match(v({ start: '2026-08-07', end: '2026-08-10' }), /vom 3\. August bis 7\. August 2026/);
  assert.equal(v({ start: '2026-09-01', half: 'pm' }), undefined);
  assert.match(v({ start: '2026-09-01', half: 'am' }), /am 1\. September 2026 \(Vormittag\)/);
  assert.match(v({ start: '2026-09-01' }), /überschneidet/);
  assert.equal(v({ start: '2026-10-05' }), undefined, 'declined entries do not block');
  assert.equal(v({ start: '2026-08-04', end: '2026-08-06' }, 'a'), undefined, 'editing itself is fine');
});

test('validation: names', () => {
  assert.equal(r.validateName('  Anna ').value, 'Anna');
  assert.match(r.validateName('').error, /Namen/);
  assert.match(r.validateName('x'.repeat(81)).error, /80 Zeichen/);
});
