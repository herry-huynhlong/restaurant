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
  const utcGuess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0));
  const zonedGuess = getZonedParts(utcGuess, timeZone);
  const asUtc = Date.UTC(zonedGuess.year, zonedGuess.month - 1, zonedGuess.day, zonedGuess.hour, zonedGuess.minute, zonedGuess.second);
  const wantedUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0);
  return new Date(utcGuess.getTime() + wantedUtc - asUtc);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function addYears(date: Date, years: number) {
  const next = new Date(date);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next;
}

export function getPeriodRange(period: ReportPeriod, timeZone = "Asia/Ho_Chi_Minh", now = new Date()) {
  const today = getZonedParts(now, timeZone);
  const todayStart = zonedDateToUtc({ year: today.year, month: today.month, day: today.day }, timeZone);
  const localDay = new Date(Date.UTC(today.year, today.month - 1, today.day));
  const dayOffset = (localDay.getUTCDay() + 6) % 7;

  if (period === "week") {
    const start = addDays(todayStart, -dayOffset);
    return { start, end: addDays(start, 7) };
  }

  if (period === "month") {
    const start = zonedDateToUtc({ year: today.year, month: today.month, day: 1 }, timeZone);
    return { start, end: addMonths(start, 1) };
  }

  if (period === "year") {
    const start = zonedDateToUtc({ year: today.year, month: 1, day: 1 }, timeZone);
    return { start, end: addYears(start, 1) };
  }

  return { start: todayStart, end: addDays(todayStart, 1) };
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

export function getBucketLabel(key: string, period: ReportPeriod) {
  if (period === "year") {
    const month = Number(key.split("-")[1]);
    return `Tháng ${month}`;
  }
  const [, month, day] = key.split("-");
  return `${day}/${month}`;
}
