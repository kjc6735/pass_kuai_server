/** 한국 시간 기준 날짜(YYYY-MM-DD). 하루 한도는 한국 자정에 초기화된다. */
export function kstDay(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}
