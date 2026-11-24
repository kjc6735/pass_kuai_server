import { nextCardState, reviewedToday } from './srs';

// 2026-11-24 15:00 KST
const now = new Date('2026-11-24T06:00:00Z');
const kst0 = (date: string) => new Date(`${date}T00:00:00+09:00`);

describe('nextCardState', () => {
  it.each([
    [0, 1, '2026-11-25'],
    [1, 2, '2026-11-27'],
    [2, 3, '2026-12-01'],
    [3, 4, '2026-12-08'],
    [4, 5, '2026-12-24'],
  ])('알았어요: %i단계 → %i단계, %s 0시(KST)', (level, next, date) => {
    expect(nextCardState(level, true, now)).toEqual({
      level: next,
      nextReviewAt: kst0(date),
    });
  });

  it('5단계에서 알았어요면 5단계에 머물고 30일 뒤', () => {
    expect(nextCardState(5, true, now)).toEqual({
      level: 5,
      nextReviewAt: kst0('2026-12-24'),
    });
  });

  it('몰랐어요면 단계 0, 내일 0시(KST)', () => {
    expect(nextCardState(4, false, now)).toEqual({
      level: 0,
      nextReviewAt: kst0('2026-11-25'),
    });
  });

  it('날짜는 UTC가 아니라 한국 시간 기준 (KST 0시 직후)', () => {
    // 2026-11-25 00:30 KST = 2026-11-24 15:30 UTC
    const justAfter = new Date('2026-11-24T15:30:00Z');
    expect(nextCardState(0, true, justAfter).nextReviewAt).toEqual(
      kst0('2026-11-26'),
    );
    expect(nextCardState(0, false, justAfter).nextReviewAt).toEqual(
      kst0('2026-11-26'),
    );
  });
});

describe('reviewedToday', () => {
  it('오늘 한국 시간 0시 이후면 true', () => {
    expect(reviewedToday(kst0('2026-11-24'), now)).toBe(true);
    expect(reviewedToday(new Date('2026-11-24T05:00:00Z'), now)).toBe(true);
  });

  it('어제거나 없으면 false', () => {
    expect(reviewedToday(new Date(kst0('2026-11-24').getTime() - 1), now)).toBe(
      false,
    );
    expect(reviewedToday(null, now)).toBe(false);
  });
});
