import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { toFile } from 'openai';
import { envNumber } from '../common/env-number';
import { AudioFile, SttProvider } from './stt.provider';

@Injectable()
export class OpenAiSttProvider extends SttProvider {
  readonly model = 'gpt-transcribe';
  private readonly client: OpenAI;

  constructor(config: ConfigService) {
    super();
    this.client = new OpenAI({
      apiKey: config.get<string>('OPENAI_API_KEY') || 'missing-openai-key',
      // 실험에서는 가짜 서버(lab/mock-llm)의 /v1 주소를 넣는다.
      baseURL: config.get<string>('OPENAI_BASE_URL') || undefined,
      maxRetries: envNumber(config, 'OPENAI_MAX_RETRIES', 1),
      timeout: envNumber(config, 'OPENAI_TIMEOUT_MS', 15_000),
    });
  }

  async transcribe(audio: AudioFile): Promise<string> {
    const result = await this.client.audio.transcriptions.create({
      model: this.model,
      file: await toFile(audio.buffer, audio.filename, {
        type: audio.mimeType,
      }),
      // 간체로 받는다. 목표 문장을 힌트(prompt, keywords)로 주지 않는다:
      // 정답을 알려 주면 틀리게 말해도 맞게 적을 수 있다.
      languages: ['zh-cn'],
    });
    return result.text ?? '';
  }
}
