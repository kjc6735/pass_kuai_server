// 연결 확인용. 초당 1건을 30초 동안 보내고 응답이 정상인지만 본다.
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL, sentences, words, pick, jsonHeaders, issueToken } from './lib/common.js';

export const options = {
  scenarios: {
    smoke: { executor: 'constant-arrival-rate', rate: 1, timeUnit: '1s', duration: '30s', preAllocatedVUs: 5, maxVUs: 20 },
  },
  thresholds: { checks: ['rate==1'] },
};

export function setup() {
  return { token: issueToken() };
}

export default function ({ token }) {
  const s = http.post(`${BASE_URL}/analyze/sentence`, JSON.stringify({ sentence: pick(sentences) }), { ...jsonHeaders(token), tags: { name: 'analyze_sentence' } });
  check(s, { '문장 분석 2xx': (r) => r.status >= 200 && r.status < 300, '결과에 문장이 있다': (r) => (r.json('sentences') || []).length > 0 });

  const w = http.post(`${BASE_URL}/analyze/word`, JSON.stringify({ word: pick(words) }), { ...jsonHeaders(token), tags: { name: 'analyze_word' } });
  check(w, { '단어 조회 2xx': (r) => r.status >= 200 && r.status < 300 });
}
