// 단어 뜻 조회 API에 계단식 부하를 건다. 같은 단어가 많이 반복되므로 캐시 실험의 기준점이 된다.
//   RATES=5,10,20,50 STEP=2m DIST=skewed (기본값)
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, words, sentences, pick, stairs, jsonHeaders, issueToken } from './lib/common.js';

export const options = {
  scenarios: {
    word: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      stages: stairs('5,10,20,50'),
      preAllocatedVUs: Number(__ENV.PRE_VUS || 100),
      maxVUs: Number(__ENV.MAX_VUS || 3000),
    },
  },
  thresholds: {
    'http_req_duration{name:analyze_word}': ['p(99)<5000'],
    'http_req_failed{name:analyze_word}': ['rate<0.01'],
  },
  summaryTrendStats: ['avg', 'p(50)', 'p(95)', 'p(99)', 'max'],
};

export function setup() {
  return { token: issueToken() };
}

export default function ({ token }) {
  // 30%는 문장과 함께 조회한다 (문맥이 있는 조회).
  const body = Math.random() < 0.3 ? { word: pick(words), context: pick(sentences) } : { word: pick(words) };
  const res = http.post(`${BASE_URL}/analyze/word`, JSON.stringify(body), { ...jsonHeaders(token), tags: { name: 'analyze_word' }, timeout: __ENV.TIMEOUT || '60s' });
  check(res, { '2xx': (r) => r.status >= 200 && r.status < 300 });
}
