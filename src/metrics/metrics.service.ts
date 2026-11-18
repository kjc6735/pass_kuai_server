import { Injectable } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from '@prometheus-io/client';

/**
 * 서버 지표를 한곳에서 관리한다.
 * Prometheus가 GET /metrics 로 5초마다 가져간다.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  /** HTTP 요청 처리 시간. route는 실제 경로가 아니라 라우트 패턴(/analyze/sentence)이다. */
  readonly httpDuration = new Histogram({
    name: 'http_server_request_duration_seconds',
    help: 'HTTP 요청 처리 시간',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 1.5, 2, 3, 5, 8, 13, 20, 30],
    registers: [this.registry],
  });

  /** 지금 처리 중인 요청 수. 뒤쪽(AI)이 느려지면 이 값이 쌓인다. */
  readonly httpInFlight = new Gauge({
    name: 'http_server_requests_in_flight',
    help: '처리 중인 HTTP 요청 수',
    labelNames: ['route'] as const,
    registers: [this.registry],
  });

  /** AI 호출 한 번의 시간. outcome: ok | truncated(출력 한도에서 끊김) | refusal | error */
  readonly llmDuration = new Histogram({
    name: 'llm_request_duration_seconds',
    help: 'AI 호출 시간',
    labelNames: ['model', 'operation', 'outcome'] as const,
    buckets: [0.1, 0.25, 0.5, 1, 1.5, 2, 3, 5, 8, 13, 20, 30],
    registers: [this.registry],
  });

  /** 하루 비용 상한에 걸려 AI를 부르지 않고 막은 횟수 */
  readonly llmBudgetBlocked = new Counter({
    name: 'llm_budget_blocked_total',
    help: '하루 비용 상한 때문에 막힌 AI 호출 수',
    labelNames: ['operation'] as const,
    registers: [this.registry],
  });

  /** AI 토큰 사용량. type: input | output | cache_write | cache_read */
  readonly llmTokens = new Counter({
    name: 'llm_tokens_total',
    help: 'AI 토큰 사용량',
    labelNames: ['model', 'operation', 'type'] as const,
    registers: [this.registry],
  });

  /** 문장 분석 한 건에 AI를 몇 번 불렀는지 (빠진 글자 재요청 포함). */
  readonly analyzeAttempts = new Histogram({
    name: 'analyze_sentence_attempts',
    help: '문장 분석 요청당 AI 호출 횟수',
    buckets: [1, 2, 3],
    registers: [this.registry],
  });

  /** 음성 인식 호출 시간. */
  readonly sttDuration = new Histogram({
    name: 'stt_request_duration_seconds',
    help: '음성 인식 호출 시간',
    labelNames: ['model', 'outcome'] as const,
    buckets: [0.25, 0.5, 1, 1.5, 2, 3, 5, 8, 13],
    registers: [this.registry],
  });

  /** 음성 인식에 보낸 음성 길이(초). 비용 계산에 쓴다. */
  readonly sttAudioSeconds = new Counter({
    name: 'stt_audio_seconds_total',
    help: '음성 인식에 보낸 음성 길이(초)',
    labelNames: ['model'] as const,
    registers: [this.registry],
  });

  constructor() {
    // 힙, RSS, external, 이벤트 루프 지연, GC 시간 등
    collectDefaultMetrics({ register: this.registry });
  }
}
