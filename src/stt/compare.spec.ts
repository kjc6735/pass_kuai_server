import { comparePronunciation, normalize } from './compare';

describe('comparePronunciation', () => {
  it('똑같이 말하면 모든 음절이 일치한다', () => {
    const r = comparePronunciation('我想喝咖啡。', '我想喝咖啡');

    expect(r.matchRate).toBe(1);
    expect(r.extraCount).toBe(0);
    expect(r.syllables.map((s) => s.pinyin)).toEqual([
      'wǒ',
      'xiǎng',
      'hē',
      'kā',
      'fēi',
    ]);
  });

  it('소리가 같은 다른 글자로 적혀도 맞은 것으로 본다 (他 / 她)', () => {
    const r = comparePronunciation('他是老师', '她是老师');

    expect(r.matchRate).toBe(1);
  });

  it('빠진 음절만 틀린 것으로 표시하고 나머지는 제자리에서 비교한다', () => {
    const r = comparePronunciation('我想喝咖啡', '我喝咖啡');

    expect(r.syllables.map((s) => s.matched)).toEqual([
      true,
      false,
      true,
      true,
      true,
    ]);
    expect(r.matchRate).toBeCloseTo(4 / 5);
  });

  it('더 말한 음절은 따로 센다', () => {
    const r = comparePronunciation('你好', '你好吗');

    expect(r.matchRate).toBe(1);
    expect(r.extraCount).toBe(1);
  });

  it('다른 소리로 말하면 그 음절이 틀린다', () => {
    const r = comparePronunciation('我想喝茶', '我想喝咖');

    expect(r.syllables.at(-1)?.matched).toBe(false);
  });

  it('아라비아 숫자와 한자 숫자를 같게 본다', () => {
    expect(normalize('我有3个苹果。')).toBe('我有三个苹果');
    expect(comparePronunciation('我有三个苹果', '我有3个苹果').matchRate).toBe(
      1,
    );
  });

  it('아무것도 인식되지 않으면 0이다', () => {
    const r = comparePronunciation('你好', '');

    expect(r.matchRate).toBe(0);
    expect(r.syllables.every((s) => !s.matched)).toBe(true);
  });
});
