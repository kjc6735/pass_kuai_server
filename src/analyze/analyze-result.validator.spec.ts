import { ANALYZE_RESULT_LIMITS as L } from '../constants/analyze';
import { validateAnalyzeResult } from './analyze-result.validator';

function validResult(): any {
  return {
    sentences: [
      {
        sentence: '我想喝咖啡。',
        translation: '커피 마시고 싶어.',
        words: [
          {
            text: '我',
            pinyin: 'wǒ',
            meaning: '나',
            pos: '대명사',
            syllables: [{ hanzi: '我', pinyin: 'wǒ', tone: 3 }],
          },
          {
            text: '咖啡',
            pinyin: 'kāfēi',
            meaning: '커피',
            syllables: [
              { hanzi: '咖', pinyin: 'kā', tone: 1 },
              { hanzi: '啡', pinyin: 'fēi', tone: 1 },
            ],
          },
        ],
      },
    ],
  };
}

function expectFail(
  raw: unknown,
  kind: 'tooLong' | 'malformed',
  path?: string,
) {
  const r = validateAnalyzeResult(raw);
  expect(r.ok).toBe(false);
  if (r.ok) return;
  expect(r.kind).toBe(kind);
  if (path) expect(r.issues.map((i) => i.path)).toContain(path);
}

describe('validateAnalyzeResult', () => {
  describe('정상', () => {
    it('올바른 결과는 그대로 통과한다', () => {
      const r = validateAnalyzeResult(validResult());
      expect(r).toEqual({ ok: true, value: validResult() });
    });

    it('앞뒤 공백은 정리한다 (자르지는 않는다)', () => {
      const raw = validResult();
      raw.sentences[0].translation = '  커피 마시고 싶어.\n';
      raw.sentences[0].words[0].meaning = ' 나 ';
      raw.sentences[0].words[0].syllables[0].hanzi = '我 ';

      const r = validateAnalyzeResult(raw);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.sentences[0].translation).toBe('커피 마시고 싶어.');
      expect(r.value.sentences[0].words[0].meaning).toBe('나');
      expect(r.value.sentences[0].words[0].syllables[0].hanzi).toBe('我');
    });

    it('빈 품사(pos)는 없는 것으로 본다', () => {
      const raw = validResult();
      raw.sentences[0].words[0].pos = '  ';
      raw.sentences[0].words[1].pos = null;

      const r = validateAnalyzeResult(raw);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.sentences[0].words[0].pos).toBeUndefined();
      expect(r.value.sentences[0].words[1].pos).toBeUndefined();
    });

    it('정의하지 않은 필드는 뺀다', () => {
      const raw = validResult();
      raw.extra = 'x';
      raw.sentences[0].words[0].note = 'x';

      const r = validateAnalyzeResult(raw);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r).toEqual({ ok: true, value: validResult() });
    });

    it('상한과 정확히 같은 길이는 통과한다', () => {
      const raw = validResult();
      raw.sentences[0].words[0].text = '好'.repeat(L.wordText);
      raw.sentences[0].words[0].meaning = '가'.repeat(L.meaning);
      raw.sentences[0].words[0].pinyin = 'a'.repeat(L.wordPinyin);
      raw.sentences[0].translation = '가'.repeat(L.translation);
      raw.sentences[0].sentence = '好'.repeat(L.sentence);
      expect(validateAnalyzeResult(raw).ok).toBe(true);
    });
  });

  describe('빈 값', () => {
    it.each([
      ['sentence', (r: any) => (r.sentences[0].sentence = '')],
      ['translation', (r: any) => (r.sentences[0].translation = '   ')],
      ['word text', (r: any) => (r.sentences[0].words[0].text = '')],
      ['word pinyin', (r: any) => (r.sentences[0].words[0].pinyin = '')],
      ['word meaning', (r: any) => (r.sentences[0].words[0].meaning = ' ')],
      [
        'syllable hanzi',
        (r: any) => (r.sentences[0].words[0].syllables[0].hanzi = ''),
      ],
      [
        'syllable pinyin',
        (r: any) => (r.sentences[0].words[0].syllables[0].pinyin = ''),
      ],
    ])('%s가 비어 있으면 실패한다', (_, mutate) => {
      const raw = validResult();
      mutate(raw);
      expectFail(raw, 'malformed');
    });

    it('문장이 하나도 없으면 실패한다', () => {
      expectFail({ sentences: [] }, 'malformed', 'sentences');
    });

    it('단어가 하나도 없으면 실패한다 (앱의 문장 병음이 빈 값이 된다)', () => {
      const raw = validResult();
      raw.sentences[0].words = [];
      expectFail(raw, 'malformed', 'sentences[0].words');
    });
  });

  describe('상한 초과', () => {
    it.each([
      [
        'sentences[0].words[0].text',
        (r: any) =>
          (r.sentences[0].words[0].text = '好'.repeat(L.wordText + 1)),
      ],
      [
        'sentences[0].words[0].meaning',
        (r: any) =>
          (r.sentences[0].words[0].meaning = '가'.repeat(L.meaning + 1)),
      ],
      [
        'sentences[0].words[0].pinyin',
        (r: any) =>
          (r.sentences[0].words[0].pinyin = 'a'.repeat(L.wordPinyin + 1)),
      ],
      [
        'sentences[0].translation',
        (r: any) =>
          (r.sentences[0].translation = '가'.repeat(L.translation + 1)),
      ],
      [
        'sentences[0].sentence',
        (r: any) => (r.sentences[0].sentence = '好'.repeat(L.sentence + 1)),
      ],
    ])('%s가 상한을 넘으면 tooLong으로 실패한다', (path, mutate) => {
      const raw = validResult();
      mutate(raw);
      expectFail(raw, 'tooLong', path);
    });

    it('공백 정리 후 길이로 판단한다', () => {
      const raw = validResult();
      raw.sentences[0].words[0].text = `  ${'好'.repeat(L.wordText)}  `;
      expect(validateAnalyzeResult(raw).ok).toBe(true);
    });

    it('단어 병음을 공백으로 이은 문장 병음이 상한을 넘으면 실패한다', () => {
      const raw = validResult();
      const word = raw.sentences[0].words[0] as Record<string, unknown>;
      const count = Math.floor(L.sentencePinyin / L.wordPinyin) + 1;
      raw.sentences[0].words = Array.from({ length: count }, () => ({
        ...word,
        pinyin: 'a'.repeat(L.wordPinyin),
      }));
      expectFail(raw, 'tooLong', 'sentences[0].(pinyin join)');
    });

    it('문장 병음이 상한과 같으면 통과한다', () => {
      const raw = validResult();
      const word = raw.sentences[0].words[0] as Record<string, unknown>;
      const words = Array.from({ length: 40 }, () => ({
        ...word,
        pinyin: 'a'.repeat(199),
      }));
      words[0].pinyin = 'a'.repeat(200);
      raw.sentences[0].words = words;
      expect(validateAnalyzeResult(raw).ok).toBe(true);
    });

    it('한 단어의 음절이 너무 많으면 실패한다', () => {
      const raw = validResult();
      raw.sentences[0].words[0].syllables = Array.from(
        { length: L.syllablesPerWord + 1 },
        () => ({ hanzi: '好', pinyin: 'hǎo', tone: 3 }),
      );
      expectFail(raw, 'tooLong', 'sentences[0].words[0].syllables');
    });
  });

  describe('잘못된 tone', () => {
    it.each([[-1], [5], [1.5], ['3'], [null], [Number.NaN]])(
      'tone=%p 이면 실패한다',
      (tone) => {
        const raw = validResult();
        raw.sentences[0].words[0].syllables[0].tone = tone;
        expectFail(raw, 'malformed', 'sentences[0].words[0].syllables[0].tone');
      },
    );

    it('경성(0)과 4성은 통과한다', () => {
      const raw = validResult();
      raw.sentences[0].words[0].syllables[0].tone = 0;
      raw.sentences[0].words[1].syllables[0].tone = 4;
      expect(validateAnalyzeResult(raw).ok).toBe(true);
    });
  });

  describe('구조 누락·타입 오류', () => {
    it.each([[null], [undefined], ['문자열'], [[]], [42]])(
      '최상위가 객체가 아니면(%p) 실패한다',
      (raw) => {
        expectFail(raw, 'malformed', '(root)');
      },
    );

    it('sentences가 없으면 실패한다', () => {
      expectFail({}, 'malformed', 'sentences');
    });

    it('sentences가 배열이 아니면 실패한다', () => {
      expectFail({ sentences: { sentence: '你好' } }, 'malformed', 'sentences');
    });

    it('문장 항목이 객체가 아니면 실패한다', () => {
      expectFail({ sentences: ['你好'] }, 'malformed');
    });

    it.each(['sentence', 'translation', 'words'])(
      '문장의 %s가 없으면 실패한다',
      (field) => {
        const raw = validResult();
        delete raw.sentences[0][field];
        expectFail(raw, 'malformed', `sentences[0].${field}`);
      },
    );

    it.each(['text', 'pinyin', 'meaning', 'syllables'])(
      '단어의 %s가 없으면 실패한다',
      (field) => {
        const raw = validResult();
        delete raw.sentences[0].words[0][field];
        expectFail(raw, 'malformed', `sentences[0].words[0].${field}`);
      },
    );

    it.each(['hanzi', 'pinyin', 'tone'])(
      '음절의 %s가 없으면 실패한다',
      (field) => {
        const raw = validResult();
        delete raw.sentences[0].words[0].syllables[0][field];
        expectFail(
          raw,
          'malformed',
          `sentences[0].words[0].syllables[0].${field}`,
        );
      },
    );

    it('문자열 자리에 숫자가 오면 (길이 초과가 아니라) 형식 오류로 본다', () => {
      const raw = validResult();
      raw.sentences[0].words[0].meaning = 123;
      expectFail(raw, 'malformed', 'sentences[0].words[0].meaning');
    });

    it('words가 문자열이면 실패한다', () => {
      const raw = validResult();
      raw.sentences[0].words = '我 咖啡';
      expectFail(raw, 'malformed', 'sentences[0].words');
    });

    it('품사가 문자열이 아니면 실패한다', () => {
      const raw = validResult();
      raw.sentences[0].words[0].pos = 1;
      expectFail(raw, 'malformed', 'sentences[0].words[0].pos');
    });

    it('형식 오류와 길이 초과가 섞이면 형식 오류로 본다', () => {
      const raw = validResult();
      raw.sentences[0].translation = '가'.repeat(L.translation + 1);
      raw.sentences[0].words[0].syllables[0].tone = 9;
      expectFail(raw, 'malformed');
    });
  });
});
