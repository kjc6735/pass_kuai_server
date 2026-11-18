import { pinyin } from 'pinyin-pro';

const PUNCT = /[\s\p{P}\p{S}]/gu;
const DIGITS = '零一二三四五六七八九';

export interface SyllableResult {
  hanzi: string;
  pinyin: string; // 성조 표시가 있는 병음 (화면 표시용)
  matched: boolean;
}

export interface PronunciationComparison {
  target: string;
  recognized: string;
  syllables: SyllableResult[]; // 목표 문장의 음절마다 일치 여부
  matchRate: number; // 0~1
  extraCount: number; // 목표에 없는데 더 말한 음절 수
}

/** 문장부호와 공백을 빼고, 아라비아 숫자를 한자 숫자로 바꾼다. (3과 三을 같게 본다) */
export function normalize(text: string): string {
  return text.replace(PUNCT, '').replace(/[0-9]/g, (d) => DIGITS[Number(d)]);
}

/**
 * 목표 문장과 인식된 문장을 성조 없는 병음으로 비교한다.
 * 글자가 아니라 소리로 비교해서, 他와 她처럼 소리가 같은 다른 글자로 적혀도 맞은 것으로 본다.
 * 음성 인식은 성조를 채점하지 못하므로 성조는 비교하지 않는다.
 */
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

  // 최장 공통 부분열(LCS)로 정렬해서, 빠지거나 더 말한 음절이 있어도 나머지는 제자리에서 비교한다.
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
