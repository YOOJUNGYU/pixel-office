// Local calendar-date helpers for the usage buckets (never millisecond steps: DST days are 23/25 h).
const pad = (n: number) => String(n).padStart(2, '0');
export const dayKey = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const parts = (key: string) => key.split('-').map(Number);
/** Local midnight of a YYYY-MM-DD key. */
export const dayStart = (key: string): number => {
  const [y, m, d] = parts(key);
  return new Date(y, m - 1, d).getTime();
};
export const addDays = (key: string, n: number): string => {
  const [y, m, d] = parts(key);
  return dayKey(new Date(y, m - 1, d + n).getTime());
};
/** Every local date from `from` to `to`, inclusive (string compare: ISO dates sort). */
export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}
