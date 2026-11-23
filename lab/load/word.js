import http from 'k6/http';
import { check } from 'k6';
import {
  BASE_URL,
  words,
  sentences,
  pick,
  stairs,
  jsonHeaders,
  issueToken,
} from './lib/common.js';

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
  const body =
    Math.random() < 0.3
      ? { word: pick(words), context: pick(sentences) }
      : { word: pick(words) };
  const res = http.post(`${BASE_URL}/analyze/word`, JSON.stringify(body), {
    ...jsonHeaders(token),
    tags: { name: 'analyze_word' },
    timeout: __ENV.TIMEOUT || '60s',
  });
  check(res, { '2xx': (r) => r.status >= 200 && r.status < 300 });
}
