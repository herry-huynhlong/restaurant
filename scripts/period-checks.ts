import assert from "node:assert/strict";
import { getPeriodRange, getPreviousPeriodRange, getPeriodBucketKeys, localDateBoundaryToUtc, type ReportPeriod } from "../src/lib/period";

let checks = 0;
function range(period: ReportPeriod, zone: string, now: string, start: string, end: string) {
  const actual = getPeriodRange(period, zone, new Date(now));
  assert.equal(actual.start.toISOString(), start, `${zone} ${period} start ${now}`);
  assert.equal(actual.end.toISOString(), end, `${zone} ${period} end ${now}`);
  const previous = getPreviousPeriodRange(period, zone, new Date(now));
  assert.equal(previous.end.getTime(), actual.start.getTime(), "Previous period must be contiguous");
  assert.ok(previous.start < previous.end);
  checks++;
}
const hcm = "Asia/Ho_Chi_Minh";
for (const year of [2024, 2025, 2026, 2028]) {
  for (let month = 1; month <= 12; month++) {
    const start = new Date(Date.UTC(year, month - 1, 1, -7));
    const end = new Date(Date.UTC(year, month, 1, -7));
    range("month", hcm, `${year}-${String(month).padStart(2, "0")}-28T15:00:00Z`, start.toISOString(), end.toISOString());
    // Last included millisecond belongs to this month; end belongs to next month.
    assert.equal(getPeriodRange("month", hcm, new Date(end.getTime() - 1)).start.getTime(), start.getTime());
    assert.equal(getPeriodRange("month", hcm, end).start.getTime(), end.getTime());
  }
}
range("week", hcm, "2026-01-01T00:00:00Z", "2025-12-28T17:00:00.000Z", "2026-01-04T17:00:00.000Z");
range("year", hcm, "2024-02-29T12:00:00Z", "2023-12-31T17:00:00.000Z", "2024-12-31T17:00:00.000Z");
range("today", hcm, "2026-01-31T18:00:00Z", "2026-01-31T17:00:00.000Z", "2026-02-01T17:00:00.000Z");
range("today", "America/New_York", "2026-03-08T12:00:00Z", "2026-03-08T05:00:00.000Z", "2026-03-09T04:00:00.000Z");
range("today", "America/New_York", "2026-11-01T12:00:00Z", "2026-11-01T04:00:00.000Z", "2026-11-02T05:00:00.000Z");
range("week", "America/New_York", "2026-03-08T12:00:00Z", "2026-03-02T05:00:00.000Z", "2026-03-09T04:00:00.000Z");
range("month", "America/New_York", "2026-03-15T12:00:00Z", "2026-03-01T05:00:00.000Z", "2026-04-01T04:00:00.000Z");
range("month", "Europe/Berlin", "2026-03-15T12:00:00Z", "2026-02-28T23:00:00.000Z", "2026-03-31T22:00:00.000Z");
range("month", "Australia/Sydney", "2026-04-15T12:00:00Z", "2026-03-31T13:00:00.000Z", "2026-04-30T14:00:00.000Z");
range("today", "Australia/Sydney", "2026-04-05T12:00:00Z", "2026-04-04T13:00:00.000Z", "2026-04-05T14:00:00.000Z");
range("today", "Australia/Sydney", "2026-10-04T12:00:00Z", "2026-10-03T14:00:00.000Z", "2026-10-04T13:00:00.000Z");
range("today", "America/Santiago", "2026-09-06T12:00:00Z", "2026-09-06T04:00:00.000Z", "2026-09-07T03:00:00.000Z");
range("today", "America/Havana", "2026-11-01T12:00:00Z", "2026-11-01T04:00:00.000Z", "2026-11-02T05:00:00.000Z");
range("today", "Asia/Kathmandu", "2026-03-08T12:00:00Z", "2026-03-07T18:15:00.000Z", "2026-03-08T18:15:00.000Z");
range("year", "UTC", "2026-12-31T23:00:00Z", "2026-01-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z");
range("month", "Asia/Bangkok", "2026-02-15T00:00:00Z", "2026-01-31T17:00:00.000Z", "2026-02-28T17:00:00.000Z");
range("month", "Asia/Tokyo", "2026-02-15T00:00:00Z", "2026-01-31T15:00:00.000Z", "2026-02-28T15:00:00.000Z");
assert.equal(localDateBoundaryToUtc("2025-02-29"), null);
assert.equal(localDateBoundaryToUtc("2024-02-29", hcm, 1)?.toISOString(), "2024-02-29T17:00:00.000Z");
assert.equal(localDateBoundaryToUtc("2026-03-08", "America/New_York", 1)?.toISOString(), "2026-03-09T04:00:00.000Z");
for (const zone of [hcm, "UTC", "Asia/Bangkok", "Asia/Tokyo", "Asia/Kathmandu", "America/New_York", "Europe/Berlin", "Australia/Sydney"]) {
  for (const now of ["2024-02-15T12:00:00Z", "2026-03-15T12:00:00Z", "2026-11-15T12:00:00Z"]) {
    const anchor = new Date(now);
    for (const period of ["week", "month", "year"] as const) {
      const { start, end } = getPeriodRange(period, zone, anchor);
      const keys = getPeriodBucketKeys(period, start, end, zone);
      const expected = period === "week" ? 7 : period === "year" ? 12 : new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0)).getUTCDate();
      assert.equal(keys.length, expected, `${zone} ${period} bucket count`);
      assert.equal(new Set(keys).size, expected);
    }
  }
}
console.log(`Period checks passed: ${checks} fixed ranges, previous periods, leap years, half-open boundaries and DST.`);
