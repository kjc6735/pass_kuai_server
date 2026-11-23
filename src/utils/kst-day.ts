export function kstDay(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export function nextKstMidnight(now: Date = new Date()): Date {
  const KST = 9 * 60 * 60 * 1000;
  const day = Math.floor((now.getTime() + KST) / 86_400_000);
  return new Date((day + 1) * 86_400_000 - KST);
}
