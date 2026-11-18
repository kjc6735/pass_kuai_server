import Anthropic from "@anthropic-ai/sdk";

export const LOOKUP_SYSTEM_PROMPT = `당신은 중국어-한국어 사전입니다.
- 단어의 주요 뜻을 최대 3개까지 쉼표로 구분해 제시하세요 (가장 일반적인 뜻이 맨 앞)
- 문장이 함께 주어지면, 그 문맥에서의 뜻 하나만 골라 제시하세요
- 간체·번체 모두 처리하세요
- 설명 없이 뜻만 출력하세요`;

export const LOOKUP_EXAMPLES: Anthropic.MessageParam[] = [
  { role: 'user', content: '다음 단어의 한국어 뜻을 알려줘: "打"' },
  { role: 'assistant', content: '치다, (전화를) 걸다, 만들다' },
  { role: 'user', content: '다음 문장에서 "打"의 한국어 뜻을 알려줘: "我给他打电话。"' },
  { role: 'assistant', content: '(전화를) 걸다' },
  { role: 'user', content: '다음 단어의 한국어 뜻을 알려줘: "马马虎虎"' },
  { role: 'assistant', content: '그저 그렇다, 대충대충 하다' },
];

export const ANALYZE_SYSTEM_PROMPT = `당신은 중국어를 분석하고 한국어로 번역하는 전문가입니다.
입력된 중국어 텍스트를 문장 단위로 나누고, 각 문장을 단어 단위로 분해해 분석하세요.

규칙:
- 직역이 아닌 의역으로, 한국인이 실제로 쓰는 자연스러운 번역을 만드세요
- ★중요: 문장에 나오는 모든 단어를 빠짐없이, 등장한 순서 그대로 words 배열에 담으세요. 일부만 골라 넣지 마세요
- 모든 한자가 어느 단어엔가 반드시 포함되어야 합니다. 단어들의 글자를 순서대로 이으면 원문(문장부호 제외)과 정확히 일치해야 합니다
- 예: "我想喝咖啡。"는 我 / 想 / 喝 / 咖啡 네 단어로 모두 나와야 합니다
- 단어 분리는 의미 단위로 하세요 (예: "电话", "打电话"처럼 한 덩어리로 묶이는 것은 하나의 단어로)
- 문장부호(，。？！ 등)는 단어로 넣지 마세요
- pinyin은 성조 기호(ā á ǎ à)를 포함한 표준 한어병음으로 작성하세요
- 각 단어를 글자(한자) 단위로 다시 쪼개 음절(syllable)별 병음과 성조를 제공하세요
- 성조(tone)는 1~4성은 1~4, 경성은 0으로 표기하세요
- 품사(pos)는 명사/동사/형용사/부사/대명사/조사/접속사/수사/양사 등 한국어로 간단히 표기하세요 (판단이 어려우면 생략 가능)
- 간체·번체 모두 처리하세요
- 반드시 submit_analysis 도구를 호출해 결과를 반환하세요`;

export const ANALYZE_TOOL: Anthropic.Tool = {
  name: 'submit_analysis',
  description: '중국어 텍스트 분석 결과를 구조화된 형태로 제출합니다.',
  input_schema: {
    type: 'object',
    properties: {
      sentences: {
        type: 'array',
        description: '입력 텍스트를 문장 단위로 나눈 분석 결과 목록',
        items: {
          type: 'object',
          properties: {
            sentence: {
              type: 'string',
              description: '원문 중국어 문장',
            },
            translation: {
              type: 'string',
              description: '자연스러운 한국어 번역',
            },
            words: {
              type: 'array',
              description: '문장을 의미 단위로 분해한 단어 목록',
              items: {
                type: 'object',
                properties: {
                  text: {
                    type: 'string',
                    description: '단어(한자), 예) 咖啡',
                  },
                  pinyin: {
                    type: 'string',
                    description: '단어 전체의 병음(성조 기호 포함), 예) kāfēi',
                  },
                  meaning: {
                    type: 'string',
                    description: '이 문맥에서의 한국어 뜻',
                  },
                  pos: {
                    type: 'string',
                    description: '품사(명사/동사/형용사 등). 불확실하면 생략',
                  },
                  syllables: {
                    type: 'array',
                    description: '단어를 한 글자(음절) 단위로 분해한 목록',
                    items: {
                      type: 'object',
                      properties: {
                        hanzi: {
                          type: 'string',
                          description: '한 글자, 예) 咖',
                        },
                        pinyin: {
                          type: 'string',
                          description: '한 음절 병음(성조 기호 포함), 예) kā',
                        },
                        tone: {
                          type: 'integer',
                          description: '성조: 1~4성, 경성은 0',
                          minimum: 0,
                          maximum: 4,
                        },
                      },
                      required: ['hanzi', 'pinyin', 'tone'],
                    },
                  },
                },
                required: ['text', 'pinyin', 'meaning', 'syllables'],
              },
            },
          },
          required: ['sentence', 'translation', 'words'],
        },
      },
    },
    required: ['sentences'],
  },
};

