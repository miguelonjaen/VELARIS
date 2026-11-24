import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calendarDay, dueStatus } from './documentDashboardModel';
test('expiry uses calendar days, including today and the 30-day boundary', () => {
  assert.equal(dueStatus('2026-10-31','2026-11-01'),'overdue');
  assert.equal(dueStatus('2026-11-01','2026-11-01'),'soon');
  assert.equal(dueStatus('2026-12-01','2026-11-01'),'soon');
  assert.equal(dueStatus('2026-12-02','2026-11-01'),'scheduled');
});
test('missing, malformed and impossible dates do not become compliance evidence', () => {
  for (const value of [undefined,'','2026-02-30','invalid','2026-13-01']) {
    assert.equal(calendarDay(value),null);
    assert.equal(dueStatus(value,'2026-11-01'),'missing');
  }
});
test('leap year and DST do not alter calendar dates', () => {
  assert.notEqual(calendarDay('2028-02-29'),null);
  assert.equal(calendarDay('2026-02-29'),null);
  assert.equal(dueStatus('2026-03-30','2026-03-29'),'soon');
});
