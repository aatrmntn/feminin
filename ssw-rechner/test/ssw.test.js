// SSW-Rechner (ssw-rules.js): windows from the practice's spreadsheet, suggestions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as s from '../ssw-rules.js';

const exam = (id) => s.EXAMS.find((e) => e.id === id);

test('due date and last period are 280 days apart', () => {
  assert.equal(s.lmpFromDue('2026-10-11'), '2026-01-04');
  assert.equal(s.dueFromLmp('2026-01-04'), '2026-10-11');
  assert.deepEqual(s.gestation('2026-01-04', '2026-03-31'), { weeks: 12, days: 2, total: 86 });
  assert.equal(s.gestation('2026-01-04', '2026-01-03'), null);
  assert.equal(s.sswText(94), '13+3');
});

// EGT 11.10.2026; 3D and growth scan as in FEMININ_SSW-RECHNER.xlsx.
test('possible windows', () => {
  const lmp = s.lmpFromDue('2026-10-11');
  const span = (id) => {
    const p = s.planExam(exam(id), lmp, '2026-01-05');
    return [p.possible.start, p.possible.end];
  };
  assert.deepEqual(span('ets'), ['2026-03-22', '2026-04-11']); // 11+0 to 13+6
  assert.deepEqual(span('organ'), ['2026-05-10', '2026-06-20']); // 18+0 to 23+6
  assert.deepEqual(span('3d'), ['2026-07-05', '2026-08-01']);
  assert.deepEqual(span('growth'), ['2026-08-02', '2026-08-29']);
});

test('preferred windows lie inside the possible ones', () => {
  for (const e of s.EXAMS.filter((x) => x.preferred)) {
    assert.ok(e.possible[0] <= e.preferred[0] && e.preferred[1] <= e.possible[1], e.id);
  }
});

test('status follows today', () => {
  const lmp = '2026-01-04';
  const st = (today) => s.planExam(exam('ets'), lmp, today).status;
  assert.equal(st('2026-03-01'), 'upcoming');
  assert.equal(st('2026-03-22'), 'early'); // 11+0
  assert.equal(st('2026-03-29'), 'now'); // 12+0
  assert.equal(st('2026-04-09'), 'now'); // 13+4
  assert.equal(st('2026-04-10'), 'late'); // 13+5
  assert.equal(st('2026-04-12'), 'missed');
});

test('suggestions are open days in the preferred window, spread out, never in the past', () => {
  const isOpen = s.openDayTest(['mon', 'tue', 'wed', 'thu', 'fri']);
  const lmp = s.lmpFromDue('2027-03-20'); // 2026-06-13
  const p = s.planExam(exam('organ'), lmp, '2026-07-01', { isOpen });
  assert.equal(p.suggestions.length, 4);
  for (const x of p.suggestions) {
    assert.ok(x.date >= p.preferred.start && x.date <= p.preferred.end);
    assert.ok(isOpen(x.date));
  }
  assert.equal(p.suggestions[0].date, '2026-11-09'); // 21+0 is Saturday 7 Nov → Monday
  // Halfway through: only days from today on.
  const later = s.planExam(exam('organ'), lmp, '2026-11-16', { isOpen });
  assert.ok(later.suggestions.every((x) => x.date >= '2026-11-16'));
  // Preferred window over: the rest of the possible window.
  const late = s.planExam(exam('organ'), lmp, '2026-11-26', { isOpen });
  assert.equal(late.status, 'late');
  assert.deepEqual(late.suggestions.map((x) => x.date), ['2026-11-26', '2026-11-27']);
  assert.equal(s.planExam(exam('organ'), lmp, '2026-11-28', { isOpen }).suggestions.length, 0);
});

test('holidays and closures are not suggested', () => {
  const isOpen = s.openDayTest(['mon', 'tue', 'wed', 'thu', 'fri'], [{ start: '2026-12-24', end: '2027-01-06' }]);
  assert.equal(isOpen('2026-12-08'), false); // Mariä Empfängnis
  assert.equal(isOpen('2026-12-28'), false); // Betriebsurlaub
  assert.equal(isOpen('2026-12-12'), false); // Saturday
  assert.equal(isOpen('2026-12-09'), true);
});

test('Austrian holidays with Easter', () => {
  const dates = (y) => s.publicHolidays(y).map((x) => x.date);
  assert.equal(dates(2026).length, 13);
  assert.ok(dates(2026).includes('2026-04-06')); // Ostermontag
  assert.ok(dates(2026).includes('2026-06-04')); // Fronleichnam
  assert.ok(dates(2027).includes('2027-03-29')); // Ostermontag
  assert.ok(dates(2027).includes('2027-05-06')); // Christi Himmelfahrt
});

test('3D scan has only a possible window', () => {
  const isOpen = s.openDayTest();
  const lmp = '2026-01-04';
  const plan = (today) => s.planExam(exam('3d'), lmp, today, { isOpen });
  assert.equal(plan('2026-07-01').preferred, null);
  assert.equal(plan('2026-07-01').status, 'upcoming');
  assert.equal(plan('2026-07-05').status, 'now'); // 26+0
  assert.equal(plan('2026-08-02').status, 'missed');
  assert.equal(plan('2026-07-01').suggestions[0].date, '2026-07-06'); // first open day from 26+0
  assert.equal(plan('2026-07-01').suggestions.at(-1).date, '2026-07-31');
});
