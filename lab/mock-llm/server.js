/**
 * 가짜 Claude 서버 (Anthropic Messages API 흉내).
 * 의존성 없이 Node.js만으로 동작한다.
 *
 * 설정은 환경 변수로 시작값을 주고, 실행 중에는 POST /config 로 바꾼다.
 *   curl -X POST localhost:8080/config -H 'content-type: application/json' -d '{"latencyMs":15000}'
 *
 * 지표: GET /metrics (Prometheus 형식)
 */
const http = require('node:http');

const env = (k, d) => (process.env[k] === undefined ? d : Number(process.env[k]));
const config = {
  latencyMs: env('LATENCY_MS', 1500), // 평균 지연
  jitterMs: env('JITTER_MS', 300), // 평균에서 ± 흔들림
  tailRate: env('TAIL_RATE', 0.01), // 가끔 나오는 긴 지연의 비율
  tailMs: env('TAIL_MS', 6000), // 긴 지연의 크기
  errorRate: env('ERROR_RATE', 0), // 실패 응답 비율
  errorStatus: env('ERROR_STATUS', 529), // 실패할 때의 상태 코드 (429, 500, 529)
  rpmLimit: env('RPM_LIMIT', 0), // 분당 요청 한도. 0이면 없음
  dropRate: env('DROP_RATE', 0), // 분석 결과에서 글자를 빠뜨릴 비율 (재요청 유발)
  msPerOutputToken: env('MS_PER_OUTPUT_TOKEN', 0), // 0이 아니면 출력 길이에 비례해 지연을 더한다
  sttLatencyMs: env('STT_LATENCY_MS', 800), // 음성 인식 응답 시간
};
// 음성 인식이 돌려줄 문장. 숫자가 아니라서 /config가 아니라 환경 변수로만 바꾼다.
const STT_TEXT = process.env.STT_TEXT || '我想喝一杯咖啡。';

// ── 지표 ──────────────────────────────────────────────
const counts = new Map(); // key: `${model}|${status}`
let inFlight = 0;
let aborted = 0;
const durationBuckets = [0.1, 0.25, 0.5, 1, 1.5, 2, 3, 5, 8, 13, 20, 30];
const durationHist = { buckets: durationBuckets.map(() => 0), sum: 0, count: 0 };
function recordRequest(model, status, seconds) {
  const key = `${model}|${status}`;
  counts.set(key, (counts.get(key) ?? 0) + 1);
  durationHist.count++;
  durationHist.sum += seconds;
  durationBuckets.forEach((b, i) => { if (seconds <= b) durationHist.buckets[i]++; });
}
function metricsText() {
  const lines = [
    '# HELP mock_llm_requests_total 가짜 Claude가 받은 요청 수',
    '# TYPE mock_llm_requests_total counter',
  ];
  for (const [key, v] of counts) {
    const [model, status] = key.split('|');
    lines.push(`mock_llm_requests_total{model="${model}",status="${status}"} ${v}`);
  }
  lines.push('# HELP mock_llm_in_flight 처리 중인 요청 수', '# TYPE mock_llm_in_flight gauge', `mock_llm_in_flight ${inFlight}`);
  lines.push('# HELP mock_llm_aborted_total 응답 전에 끊긴 요청 수', '# TYPE mock_llm_aborted_total counter', `mock_llm_aborted_total ${aborted}`);
  lines.push('# HELP mock_llm_response_seconds 가짜 Claude의 응답 시간', '# TYPE mock_llm_response_seconds histogram');
  durationBuckets.forEach((b, i) => lines.push(`mock_llm_response_seconds_bucket{le="${b}"} ${durationHist.buckets[i]}`));
  lines.push(`mock_llm_response_seconds_bucket{le="+Inf"} ${durationHist.count}`);
  lines.push(`mock_llm_response_seconds_sum ${durationHist.sum}`, `mock_llm_response_seconds_count ${durationHist.count}`);
  for (const [k, v] of Object.entries(config)) {
    lines.push(`mock_llm_config{key="${k}"} ${v}`);
  }
  return lines.join('\n') + '\n';
}

// ── 분당 한도 (최근 60초 창) ─────────────────────────────
const recent = [];
function overRateLimit(now) {
  if (!config.rpmLimit) return false;
  while (recent.length && recent[0] <= now - 60_000) recent.shift();
  if (recent.length >= config.rpmLimit) return true;
  recent.push(now);
  return false;
}

// ── 응답 만들기 ─────────────────────────────────────────
const PUNCT = /[\s\p{P}\p{S}]/gu;
function splitSentences(text) {
  return text.split(/(?<=[。！？!?；;\n])/u).map((s) => s.trim()).filter((s) => s.replace(PUNCT, '').length > 0);
}
function analyze(text) {
  const sentences = splitSentences(text).map((sentence) => {
    let chars = [...sentence.replace(PUNCT, '')];
    if (config.dropRate > 0 && chars.length > 1 && Math.random() < config.dropRate) {
      chars.splice(Math.floor(Math.random() * chars.length), 1); // 일부러 한 글자를 빠뜨린다
    }
    return {
      sentence,
      translation: `(가짜 번역) ${sentence}`,
      words: chars.map((ch) => ({
        text: ch,
        pinyin: 'mǎ',
        meaning: '(가짜 뜻)',
        pos: '명사',
        syllables: [{ hanzi: ch, pinyin: 'mǎ', tone: 3 }],
      })),
    };
  });
  return { sentences };
}
function lastUserText(body) {
  const msgs = body.messages ?? [];
  const last = msgs[msgs.length - 1];
  if (!last) return '';
  if (typeof last.content === 'string') return last.content;
  return (last.content ?? []).filter((b) => b.type === 'text').map((b) => b.text).join('');
}
function estimateTokens(s) {
  return Math.max(1, Math.ceil(s.length / 1.5));
}
function buildResponse(body) {
  const userText = lastUserText(body);
  const inputTokens = estimateTokens(JSON.stringify(body.system ?? '') + JSON.stringify(body.messages ?? []));
  const base = { id: `msg_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, type: 'message', role: 'assistant', model: body.model, stop_sequence: null };

  if (Array.isArray(body.tools) && body.tools.length > 0) {
    // 분석 요청: 따옴표 안의 원문을 꺼내 글자 단위로 나눈다.
    const quoted = userText.match(/"([\s\S]*?)"/);
    const input = analyze(quoted ? quoted[1] : userText);
    const outputTokens = estimateTokens(JSON.stringify(input));
    return {
      outputTokens,
      body: { ...base, content: [{ type: 'tool_use', id: `toolu_mock_${Date.now()}`, name: body.tools[0].name, input }], stop_reason: 'tool_use', usage: { input_tokens: inputTokens, output_tokens: outputTokens } },
    };
  }
  const text = '(가짜 뜻), (가짜 뜻 2)';
  const outputTokens = estimateTokens(text);
  return { outputTokens, body: { ...base, content: [{ type: 'text', text }], stop_reason: 'end_turn', usage: { input_tokens: inputTokens, output_tokens: outputTokens } } };
}
function delayFor(outputTokens) {
  const tail = Math.random() < config.tailRate ? config.tailMs : 0;
  const jitter = (Math.random() * 2 - 1) * config.jitterMs;
  return Math.max(0, config.latencyMs + jitter + tail + outputTokens * config.msPerOutputToken);
}

// ── HTTP 서버 ──────────────────────────────────────────
function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}
function send(res, status, obj, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json', ...headers });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/metrics') {
      res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
      return res.end(metricsText());
    }
    if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/config')) {
      return send(res, 200, url.pathname === '/health' ? { status: 'ok' } : config);
    }
    if (req.method === 'POST' && url.pathname === '/config') {
      const patch = await readJson(req);
      for (const [k, v] of Object.entries(patch)) {
        if (!(k in config) || typeof v !== 'number') return send(res, 400, { error: `unknown or non-number key: ${k}` });
        config[k] = v;
      }
      console.log(JSON.stringify({ msg: 'config updated', config }));
      return send(res, 200, config);
    }
    if (req.method === 'POST' && url.pathname === '/v1/audio/transcriptions') {
      // OpenAI 음성 인식 흉내. 업로드된 파일은 읽고 버린다.
      const startedAt = performance.now();
      for await (const _ of req) { /* 본문을 끝까지 읽는다 */ }
      inFlight++;
      try {
        await new Promise((r) => setTimeout(r, Math.max(0, config.sttLatencyMs + (Math.random() * 2 - 1) * config.jitterMs * 0.3)));
        if (Math.random() < config.errorRate) {
          recordRequest('gpt-transcribe', 500, (performance.now() - startedAt) / 1000);
          return send(res, 500, { error: { message: 'mock failure', type: 'server_error' } });
        }
        recordRequest('gpt-transcribe', 200, (performance.now() - startedAt) / 1000);
        return send(res, 200, { text: STT_TEXT, usage: { type: 'duration', seconds: 3 } });
      } finally {
        inFlight--;
      }
    }
    if (req.method === 'POST' && url.pathname === '/v1/messages') {
      const startedAt = performance.now();
      const body = await readJson(req);
      const model = String(body.model ?? 'unknown');
      inFlight++;
      let closed = false;
      res.on('close', () => { if (!res.writableEnded) { closed = true; aborted++; } });
      try {
        if (overRateLimit(Date.now())) {
          recordRequest(model, 429, (performance.now() - startedAt) / 1000);
          return send(res, 429, { type: 'error', error: { type: 'rate_limit_error', message: 'mock rate limit' } }, { 'retry-after': '5' });
        }
        const { outputTokens, body: reply } = buildResponse(body);
        await new Promise((r) => setTimeout(r, delayFor(outputTokens)));
        if (closed) return;
        if (Math.random() < config.errorRate) {
          recordRequest(model, config.errorStatus, (performance.now() - startedAt) / 1000);
          const type = config.errorStatus === 429 ? 'rate_limit_error' : config.errorStatus === 529 ? 'overloaded_error' : 'api_error';
          return send(res, config.errorStatus, { type: 'error', error: { type, message: 'mock failure' } });
        }
        recordRequest(model, 200, (performance.now() - startedAt) / 1000);
        return send(res, 200, reply);
      } finally {
        inFlight--;
      }
    }
    send(res, 404, { error: 'not found' });
  } catch (err) {
    send(res, 400, { error: String(err?.message ?? err) });
  }
});

const port = Number(process.env.PORT ?? 8080);
server.keepAliveTimeout = 65_000;
server.listen(port, () => console.log(JSON.stringify({ msg: 'mock-llm listening', port, config })));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)));
