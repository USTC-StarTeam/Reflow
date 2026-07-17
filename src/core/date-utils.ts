const pad = (value: number) => String(value).padStart(2, '0');

export function dateKey(date: Date | string): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
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

export function startOfDay(date: Date): Date {
  return atTime(date, 0, 0);
}

export function startOfWeek(date: Date): Date {
  const value = startOfDay(date);
  const day = value.getDay() || 7;
  return addDays(value, 1 - day);
}

export function formatShortDate(date: Date | string): string {
  const value = typeof date === 'string' ? new Date(date) : date;
  return `${value.getMonth() + 1}月${value.getDate()}日`;
}

export function formatTime(date?: string): string {
  if (!date) return '弹性时间';
  const value = new Date(date);
  return `${pad(value.getHours())}:${pad(value.getMinutes())}`;
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
  return `${prefix}-${Date.now().toString(36)}`;
}
