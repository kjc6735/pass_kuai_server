const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

export function kstDay(now: Date = new Date()): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function kstMidnight(now: Date = new Date(), addDays = 0): Date {
  const day = Math.floor((now.getTime() + KST_OFFSET_MS) / DAY_MS);
  return new Date((day + addDays) * DAY_MS - KST_OFFSET_MS);
}

export function nextKstMidnight(now: Date = new Date()): Date {
  return kstMidnight(now, 1);
}
