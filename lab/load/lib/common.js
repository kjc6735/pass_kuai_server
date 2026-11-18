import { SharedArray } from 'k6/data';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const sentences = new SharedArray('sentences', () => JSON.parse(open('../data/sentences.json')));
export const words = new SharedArray('words', () => JSON.parse(open('../data/words.json')));

/**
 * 목록에서 하나를 고른다.
 * DIST=uniform  : 모두 같은 확률 (캐시가 거의 안 맞는 최악의 경우)
 * DIST=skewed   : 앞쪽 10%가 요청의 절반을 차지 (실제 사용에 가까운 경우, 기본값)
 */
export function pick(list) {
  const n = list.length;
  if ((__ENV.DIST || 'skewed') === 'uniform') return list[Math.floor(Math.random() * n)];
  const hot = Math.max(1, Math.floor(n * 0.1));
  return Math.random() < 0.5 ? list[Math.floor(Math.random() * hot)] : list[Math.floor(Math.random() * n)];
}

/**
 * 계단식 부하 단계를 만든다. 열린 모델(초당 요청 수 고정)이라 서버가 느려져도 부하가 줄지 않는다.
 * RATES=5,10,20,50,100  STEP=2m  RAMP=10s
 */
export function stairs(defaultRates) {
  const rates = (__ENV.RATES || defaultRates).split(',').map(Number);
  const step = __ENV.STEP || '2m';
  const ramp = __ENV.RAMP || '10s';
  const stages = [];
  for (const r of rates) {
    stages.push({ target: r, duration: ramp });
    stages.push({ target: r, duration: step });
  }
  stages.push({ target: 0, duration: ramp });
  return stages;
}

import http from 'k6/http';

/** 테스트 시작 전에 한 번 토큰을 받는다. 스크립트의 setup()에서 부른다. */
export function issueToken() {
  const res = http.post(`${BASE_URL}/auth/device`, null, { tags: { name: 'auth_device' } });
  if (res.status !== 200) throw new Error(`토큰 발급 실패: ${res.status} ${res.body}`);
  return res.json('token');
}

/** 토큰을 실은 JSON 요청 옵션. */
export function jsonHeaders(token) {
  return { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } };
}
