export const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const DAY = 86_400;
export function japanDate(now: Date): string {
  return new Date(now.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}
export function nextNotificationAt(time: string, now: Date): number {
  if (!TIME_PATTERN.test(time)) throw new Error("invalid_time");
  const candidate = Date.parse(`${japanDate(now)}T${time}:00+09:00`) / 1000;
  return candidate > now.getTime() / 1000 ? candidate : candidate + DAY;
}
export function isDueFresh(due: number, now: number): boolean {
  return now >= due && now - due <= 15 * 60;
}
