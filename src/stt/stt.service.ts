import { Injectable, Logger } from '@nestjs/common';
import { STT_USD_PER_MINUTE } from '../constants/llm';
import { MetricsService } from '../metrics/metrics.service';
import { UsageService } from '../usage/usage.service';
import { comparePronunciation, PronunciationComparison } from './compare';
import { AudioFile, SttProvider } from './stt.provider';

export interface TranscribeResult {
  text: string;
  comparison?: PronunciationComparison;
}

@Injectable()
export class SttService {
  private readonly logger = new Logger('Stt');

  constructor(
    private readonly provider: SttProvider,
    private readonly usage: UsageService,
    private readonly metrics: MetricsService,
  ) {}

  async transcribe(
    userId: string,
    audio: AudioFile,
    durationMs: number,
    target?: string,
  ): Promise<TranscribeResult> {
    const seconds = Math.ceil(durationMs / 1000);
    this.usage.assertWithinBudget();
    const refund = this.usage.consumeAudio(userId, seconds);

    const startedAt = performance.now();
    let outcome: 'ok' | 'error' = 'ok';
    try {
      const text = await this.provider.transcribe(audio);
      return target
        ? { text, comparison: comparePronunciation(target, text) }
        : { text };
    } catch (err) {
      outcome = 'error';
      refund();
      throw err;
    } finally {
      const ms = performance.now() - startedAt;
      const costUsd = (seconds / 60) * STT_USD_PER_MINUTE;
      this.usage.addCost(costUsd);
      this.metrics.sttDuration.observe(
        { model: this.provider.model, outcome },
        ms / 1000,
      );
      this.metrics.sttAudioSeconds.inc({ model: this.provider.model }, seconds);
      this.logger.log(
        JSON.stringify({
          event: 'stt_call',
          model: this.provider.model,
          outcome,
          audioSeconds: seconds,
          bytes: audio.buffer.length,
          ms: Math.round(ms),
          costUsd: Number(costUsd.toFixed(6)),
        }),
      );
    }
  }
}
