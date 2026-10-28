// SSW-Rechner (ssw-rules.js): windows and status.
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

test('3D scan has only a possible window', () => {
  const lmp = '2026-01-04';
  const plan = (today) => s.planExam(exam('3d'), lmp, today);
  assert.equal(plan('2026-07-01').preferred, null);
  assert.equal(plan('2026-07-01').status, 'upcoming');
  assert.equal(plan('2026-07-05').status, 'now'); // 26+0
  assert.equal(plan('2026-08-01').status, 'now'); // 29+6
  assert.equal(plan('2026-08-02').status, 'missed');
});
