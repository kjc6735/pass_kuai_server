import { Injectable } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from '@prometheus-io/client';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly httpDuration = new Histogram({
    name: 'http_server_request_duration_seconds',
    help: 'HTTP 요청 처리 시간',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 1.5, 2, 3, 5, 8, 13, 20, 30],
    registers: [this.registry],
  });

  readonly httpInFlight = new Gauge({
    name: 'http_server_requests_in_flight',
    help: '처리 중인 HTTP 요청 수',
    labelNames: ['route'] as const,
    registers: [this.registry],
  });

  readonly llmDuration = new Histogram({
    name: 'llm_request_duration_seconds',
    help: 'AI 호출 시간',
    labelNames: ['model', 'operation', 'outcome'] as const,
    buckets: [0.1, 0.25, 0.5, 1, 1.5, 2, 3, 5, 8, 13, 20, 30],
    registers: [this.registry],
  });

  readonly llmBudgetBlocked = new Counter({
    name: 'llm_budget_blocked_total',
    help: '하루 비용 상한 때문에 막힌 AI 호출 수',
    labelNames: ['operation'] as const,
    registers: [this.registry],
  });

  readonly llmTokens = new Counter({
    name: 'llm_tokens_total',
    help: 'AI 토큰 사용량',
    labelNames: ['model', 'operation', 'type'] as const,
    registers: [this.registry],
  });

  readonly analyzeAttempts = new Histogram({
    name: 'analyze_sentence_attempts',
    help: '문장 분석 요청당 AI 호출 횟수',
    buckets: [1, 2, 3],
    registers: [this.registry],
  });

  readonly sttDuration = new Histogram({
    name: 'stt_request_duration_seconds',
    help: '음성 인식 호출 시간',
    labelNames: ['model', 'outcome'] as const,
    buckets: [0.25, 0.5, 1, 1.5, 2, 3, 5, 8, 13],
    registers: [this.registry],
  });

  readonly sttAudioSeconds = new Counter({
    name: 'stt_audio_seconds_total',
    help: '음성 인식에 보낸 음성 길이(초)',
    labelNames: ['model'] as const,
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry });
  }
}
