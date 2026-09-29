const MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/u;
const MONTH_NAMES = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
] as const;

export function isPlannerMonth(value: string | undefined): value is string {
  return value !== undefined && MONTH_PATTERN.test(value);
}

export function getCurrentPlannerMonth(now = new Date(), timeZone = "Asia/Yekaterinburg"): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}`;
}

export function formatPlannerMonth(month: string): string {
  const monthIndex = Number(month.slice(5, 7)) - 1;
  return `${MONTH_NAMES[monthIndex]} ${month.slice(0, 4)}`;
}

export function getPlannerMonthDays(month: string): number {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
}
