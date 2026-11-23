import { SharedArray } from 'k6/data';

export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const sentences = new SharedArray('sentences', () =>
  JSON.parse(open('../data/sentences.json')),
);
export const words = new SharedArray('words', () =>
  JSON.parse(open('../data/words.json')),
);

export function pick(list) {
  const n = list.length;
  if ((__ENV.DIST || 'skewed') === 'uniform')
    return list[Math.floor(Math.random() * n)];
  const hot = Math.max(1, Math.floor(n * 0.1));
  return Math.random() < 0.5
    ? list[Math.floor(Math.random() * hot)]
    : list[Math.floor(Math.random() * n)];
}

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

export function issueToken() {
  if (!__ENV.TOKEN)
    throw new Error('TOKEN이 없어요. npm run load:* 로 실행하세요.');
  return __ENV.TOKEN;
}

export function jsonHeaders(token) {
  return {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };
}
