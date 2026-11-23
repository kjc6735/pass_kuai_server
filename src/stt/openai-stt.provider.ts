import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { toFile } from 'openai';
import { AudioFile, SttProvider } from './stt.provider';
import { Env } from '../constants/env';
import type { EnvConfig } from '../config/env.schema';

@Injectable()
export class OpenAiSttProvider extends SttProvider {
  readonly model = 'gpt-transcribe';
  private readonly client: OpenAI;

  constructor(config: ConfigService<EnvConfig, true>) {
    super();
    this.client = new OpenAI({
      apiKey:
        config.get(Env.OPENAI_API_KEY, { infer: true }) || 'missing-openai-key',
      baseURL: config.get(Env.OPENAI_BASE_URL, { infer: true }),
      maxRetries: config.get(Env.OPENAI_MAX_RETRIES, { infer: true }),
      timeout: config.get(Env.OPENAI_TIMEOUT_MS, { infer: true }),
    });
  }

  async transcribe(audio: AudioFile): Promise<string> {
    const result = await this.client.audio.transcriptions.create({
      model: this.model,
      file: await toFile(audio.buffer, audio.filename, {
        type: audio.mimeType,
      }),
      languages: ['zh-cn'],
    });
    return result.text ?? '';
  }
}
