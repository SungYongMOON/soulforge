const DATE = /^\d{4}-\d{2}-\d{2}$/u;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

export function isCanonicalDate(value) {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isCanonicalDateTime(value) {
  if (typeof value !== "string" || !DATE_TIME.test(value)) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const normalizedInput = value.length === 20 ? value.replace(/Z$/u, ".000Z") : value;
  return parsed.toISOString() === normalizedInput;
}
