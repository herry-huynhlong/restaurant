export type ReportPeriod = "today" | "week" | "month" | "year";

const periodLabels: Record<ReportPeriod, string> = {
  today: "Hôm nay",
  week: "Tuần này",
  month: "Tháng này",
  year: "Năm nay"
};

export function normalizeReportPeriod(value?: string | null): ReportPeriod {
  return value === "week" || value === "month" || value === "year" ? value : "today";
}

export function getReportPeriodLabel(period: ReportPeriod) {
  return periodLabels[period];
}

function getZonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

function zonedDateToUtc(parts: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number }, timeZone: string) {
  const wantedUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0);
  const localStamp = (date: Date) => {
    const local = getZonedParts(date, timeZone);
    return Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
  };
  // Consider offsets on both sides of a clock change, rather than assuming
  // the UTC guess has the offset at local midnight (e.g. Sydney DST).
  const candidates = [-36, 0, 36].map((hours) => {
    const probe = wantedUtc + hours * 3600000;
    return wantedUtc - (localStamp(new Date(probe)) - probe);
  });
  const exact = candidates.filter((candidate) => localStamp(new Date(candidate)) === wantedUtc);
  if (exact.length) return new Date(Math.min(...exact)); // First occurrence of an ambiguous midnight.
  // Midnight can be skipped by DST. Use the first corresponding instant
  // after the gap, consistently for both adjacent half-open ranges.
  return new Date(candidates.filter((candidate) => localStamp(new Date(candidate)) > wantedUtc)
    .sort((a, b) => localStamp(new Date(a)) - localStamp(new Date(b)) || a - b)[0]);
}

export function localDateBoundaryToUtc(value: string, timeZone = "Asia/Ho_Chi_Minh", dayOffset = 0) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const input = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    input.getUTCFullYear() !== Number(match[1])
    || input.getUTCMonth() !== Number(match[2]) - 1
    || input.getUTCDate() !== Number(match[3])
  ) return null;
  const anchor = new Date(input);
  anchor.setUTCDate(anchor.getUTCDate() + dayOffset);

  return zonedDateToUtc({
    year: anchor.getUTCFullYear(),
    month: anchor.getUTCMonth() + 1,
    day: anchor.getUTCDate()
  }, timeZone);
}

export function getPeriodRange(period: ReportPeriod, timeZone = "Asia/Ho_Chi_Minh", now = new Date()) {
  const today = getZonedParts(now, timeZone);
  // Do calendar arithmetic before conversion. A local first-of-month can be
  // the 31st in UTC; adding a UTC month would overflow into the wrong month.
  const localDay = new Date(Date.UTC(today.year, today.month - 1, today.day));
  const dayOffset = (localDay.getUTCDay() + 6) % 7;
  const boundary = (year: number, month: number, day: number) => {
    const calendar = new Date(Date.UTC(year, month - 1, day));
    return zonedDateToUtc({ year: calendar.getUTCFullYear(), month: calendar.getUTCMonth() + 1, day: calendar.getUTCDate() }, timeZone);
  };
  if (period === "week") return {
    start: boundary(today.year, today.month, today.day - dayOffset),
    end: boundary(today.year, today.month, today.day - dayOffset + 7)
  };
  if (period === "month") return {
    start: boundary(today.year, today.month, 1), end: boundary(today.year, today.month + 1, 1)
  };
  if (period === "year") return {
    start: boundary(today.year, 1, 1), end: boundary(today.year + 1, 1, 1)
  };
  return { start: boundary(today.year, today.month, today.day), end: boundary(today.year, today.month, today.day + 1) };
}

export function getPreviousPeriodRange(period: ReportPeriod, timeZone = "Asia/Ho_Chi_Minh", now = new Date()) {
  const current = getPeriodRange(period, timeZone, now);
  const previousAnchor = new Date(current.start.getTime() - 1000);
  return getPeriodRange(period, timeZone, previousAnchor);
}

export function formatInTimeZone(date: Date, timeZone = "Asia/Ho_Chi_Minh", options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone,
    ...options
  }).format(date);
}

export function getBucketKey(date: Date, period: ReportPeriod, timeZone = "Asia/Ho_Chi_Minh") {
  const parts = getZonedParts(date, timeZone);
  if (period === "year") return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function getPeriodBucketKeys(period: ReportPeriod, start: Date, end: Date, timeZone: string) {
  const first = getZonedParts(start, timeZone);
  const last = getZonedParts(end, timeZone);
  const cursor = new Date(Date.UTC(first.year, first.month - 1, first.day));
  const limit = Date.UTC(last.year, last.month - 1, last.day);
  const keys: string[] = [];
  while (cursor.getTime() < limit) {
    const yearMonth = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
    keys.push(period === "year" ? yearMonth : `${yearMonth}-${String(cursor.getUTCDate()).padStart(2, "0")}`);
    if (period === "year") cursor.setUTCMonth(cursor.getUTCMonth() + 1, 1);
    else cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

export function getBucketLabel(key: string, period: ReportPeriod) {
  if (period === "year") {
    const month = Number(key.split("-")[1]);
    return `T${month}`;
  }
  const [, month, day] = key.split("-");
  if (period === "week") {
    const date = new Date(Date.UTC(Number(key.split("-")[0]), Number(month) - 1, Number(day)));
    const weekdays = ["CN", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
    return weekdays[date.getUTCDay()];
  }
  if (period === "month") return day;
  return `${day}/${month}`;
}
