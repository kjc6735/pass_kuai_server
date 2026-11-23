import { pinyin } from 'pinyin-pro';

const PUNCT = /[\s\p{P}\p{S}]/gu;
const DIGITS = '零一二三四五六七八九';

export interface SyllableResult {
  hanzi: string;
  pinyin: string;
  matched: boolean;
}

export interface PronunciationComparison {
  target: string;
  recognized: string;
  syllables: SyllableResult[];
  matchRate: number;
  extraCount: number;
}

export function normalize(text: string): string {
  return text.replace(PUNCT, '').replace(/[0-9]/g, (d) => DIGITS[Number(d)]);
}

export function comparePronunciation(
  target: string,
  recognized: string,
): PronunciationComparison {
  const t = [...normalize(target)];
  const r = [...normalize(recognized)];
  const tBase = t.length
    ? pinyin(t.join(''), { type: 'array', toneType: 'none' })
    : [];
  const tTone = t.length ? pinyin(t.join(''), { type: 'array' }) : [];
  const rBase = r.length
    ? pinyin(r.join(''), { type: 'array', toneType: 'none' })
    : [];

  const n = tBase.length;
  const m = rBase.length;
  const dp = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        tBase[i] === rBase[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const matched = new Array<boolean>(n).fill(false);
  for (let i = 0, j = 0; i < n && j < m; ) {
    if (tBase[i] === rBase[j]) {
      matched[i] = true;
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  const matchedCount = matched.filter(Boolean).length;

  return {
    target,
    recognized,
    syllables: t.map((hanzi, i) => ({
      hanzi,
      pinyin: tTone[i] ?? '',
      matched: matched[i],
    })),
    matchRate: n === 0 ? 0 : matchedCount / n,
    extraCount: Math.max(0, m - matchedCount),
  };
}
