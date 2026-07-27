export const DEFAULT_SKILL_COMPASS_TIME_ZONE = "Asia/Tokyo";

export function localDateKey(
  value = new Date(),
  timeZone = DEFAULT_SKILL_COMPASS_TIME_ZONE,
): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) throw new Error("local_date_format_failed");
  return `${year}-${month}-${day}`;
}
