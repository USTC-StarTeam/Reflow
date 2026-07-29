import type { LocalDate, ZonedDateTime } from './types';

const LOCAL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ZONED_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const pad = (value: number) => String(value).padStart(2, '0');
let runtimeCounter = 0;

function validDate(value: Date): boolean {
  return !Number.isNaN(value.getTime());
}

export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== 'string') return false;
  const match = LOCAL_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));
  return parsed.getFullYear() === Number(year)
    && parsed.getMonth() === Number(month) - 1
    && parsed.getDate() === Number(day);
}

export function isZonedDateTime(value: unknown): value is ZonedDateTime {
  return typeof value === 'string' && ZONED_DATE_TIME_PATTERN.test(value) && validDate(new Date(value));
}

export function timestampOf(value: Date | string): number {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (!validDate(date)) throw new Error('Invalid date value');
  return date.getTime();
}

export function durationMilliseconds(startAt: string, endAt: string): number {
  return timestampOf(endAt) - timestampOf(startAt);
}

export function localDateFromDate(date: Date): LocalDate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function localDateOf(date: Date | string): LocalDate {
  if (typeof date === 'string' && isLocalDate(date)) return date;
  const value = typeof date === 'string' ? new Date(date) : date;
  if (!validDate(value)) throw new Error('Invalid date value');
  return localDateFromDate(value);
}

export function localDateToDate(date: LocalDate): Date {
  if (!isLocalDate(date)) throw new Error('Invalid local date');
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function toZonedISOString(date: Date): ZonedDateTime {
  if (!validDate(date)) throw new Error('Invalid date value');
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetMinutes);
  const offset = `${sign}${pad(Math.floor(absoluteOffset / 60))}:${pad(absoluteOffset % 60)}`;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, '0')}${offset}`;
}

export function dateKey(date: Date | string): LocalDate {
  return localDateOf(date);
}

export function atTime(date: Date, hour: number, minute = 0): Date {
  const value = new Date(date);
  value.setHours(hour, minute, 0, 0);
  return value;
}

export function addDays(date: Date, amount: number): Date {
  const value = new Date(date);
  value.setDate(value.getDate() + amount);
  return value;
}

export function addMinutes(date: Date, amount: number): Date {
  return new Date(date.getTime() + amount * 60_000);
}

export function addLocalDays(date: LocalDate, amount: number): LocalDate {
  return localDateFromDate(addDays(localDateToDate(date), amount));
}

export function compareLocalDates(left: LocalDate, right: LocalDate): number {
  return timestampOf(localDateToDate(left)) - timestampOf(localDateToDate(right));
}

export function atLocalTime(date: LocalDate, hour: number, minute = 0): ZonedDateTime {
  return toZonedISOString(atTime(localDateToDate(date), hour, minute));
}

export function localDayInterval(date: LocalDate): { start: Date; end: Date } {
  const start = localDateToDate(date);
  return { start, end: addDays(start, 1) };
}

export function sameLocalDay(left: Date | string, right: Date | string): boolean {
  return localDateOf(left) === localDateOf(right);
}

export function intervalOverlapMilliseconds(startAt: string, endAt: string, rangeStart: Date, rangeEnd: Date): number {
  const start = timestampOf(startAt);
  const end = timestampOf(endAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.max(0, Math.min(end, rangeEnd.getTime()) - Math.max(start, rangeStart.getTime()));
}

export function startOfDay(date: Date): Date {
  return atTime(date, 0, 0);
}

export function startOfWeek(date: Date): Date {
  const value = startOfDay(date);
  const day = value.getDay() || 7;
  return addDays(value, 1 - day);
}

export function formatShortDate(date: Date | string): string {
  const value = typeof date === 'string' && isLocalDate(date) ? localDateToDate(date) : typeof date === 'string' ? new Date(date) : date;
  return `${value.getMonth() + 1}月${value.getDate()}日`;
}

export function formatTime(date?: string): string {
  if (!date) return '弹性时间';
  const value = new Date(date);
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

export function minutesOfDay(date: string): number {
  const value = new Date(date);
  if (!validDate(value)) throw new Error('Invalid date value');
  return value.getHours() * 60 + value.getMinutes();
}

export function formatDateTimeRange(start?: string, end?: string): string {
  if (!start) return '尚未排期';
  return `${formatTime(start)}${end ? `–${formatTime(end)}` : ''}`;
}

export function stableId(prefix: string, input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

export function runtimeId(prefix: string): string {
  runtimeCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${runtimeCounter.toString(36)}`;
}
