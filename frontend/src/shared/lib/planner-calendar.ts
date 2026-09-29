import { addDays, addMonths, endOfMonth, format, parseISO, startOfWeek } from "date-fns";
import { ru } from "date-fns/locale/ru";

const DAY_NAMES = ["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"] as const;

export function addPlannerDays(value: string, days: number): string {
  return format(addDays(parseISO(value), days), "yyyy-MM-dd");
}

export function addPlannerMonth(month: string, offset: number): string {
  return format(addMonths(parseISO(`${month}-01`), offset), "yyyy-MM");
}

export function getPlannerMonthStart(month: string): string {
  return `${month}-01`;
}

export function getPlannerMonthEnd(month: string): string {
  return format(endOfMonth(parseISO(`${month}-01`)), "yyyy-MM-dd");
}

export function getPlannerWeekStart(value: string): string {
  return format(startOfWeek(parseISO(value), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export function getPlannerWeekDates(start: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addPlannerDays(start, index));
}

export function getPlannerMonthWeekBounds(month: string): { first: string; last: string } {
  return {
    first: getPlannerWeekStart(getPlannerMonthStart(month)),
    last: getPlannerWeekStart(getPlannerMonthEnd(month)),
  };
}

export function clampPlannerWeekStart(value: string, month: string): string {
  const bounds = getPlannerMonthWeekBounds(month);
  if (value < bounds.first) return bounds.first;
  if (value > bounds.last) return bounds.last;
  return value;
}

export function getPlannerDayName(index: number): string {
  return DAY_NAMES[index] ?? "";
}

export function formatPlannerDay(value: string): string {
  return format(parseISO(value), "d MMM", { locale: ru }).replace(".", "");
}

export function formatPlannerWeek(start: string): string {
  const end = addPlannerDays(start, 6);
  const startDate = parseISO(start);
  const endDate = parseISO(end);
  const startMonth = format(startDate, "MMM", { locale: ru }).replace(".", "");
  const endMonth = format(endDate, "MMM", { locale: ru }).replace(".", "");
  const startDay = format(startDate, "d");
  const endDay = format(endDate, "d");
  if (startMonth === endMonth) return `${startDay}–${endDay} ${endMonth}`;
  return `${startDay} ${startMonth} – ${endDay} ${endMonth}`;
}

export function isPlannerDateInMonth(value: string, month: string): boolean {
  return value.startsWith(`${month}-`);
}

export function isPlannerDateEditable(value: string, today: string, month: string): boolean {
  return isPlannerDateInMonth(value, month) && value <= today;
}

export function clampPlannerDate(value: string, today: string, month: string): string {
  const start = getPlannerMonthStart(month);
  const end = getPlannerMonthEnd(month);
  if (today < start) return start;
  if (today > end) {
    if (value < start) return start;
    return end;
  }
  if (value < start) return start;
  if (value > end) return end;
  if (value > today) return today;
  return value;
}
