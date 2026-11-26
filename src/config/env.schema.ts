import { ConfigService } from '@nestjs/config';
import * as Joi from 'joi';
import { DEV_JWT_SECRET } from '../constants/auth';
import { Env, EnvKey, NodeEnv } from '../constants/env';
import { DEFAULT_LIMITS } from '../constants/limits';
import {
  ANTHROPIC_DEFAULT_MAX_RETRIES,
  ANTHROPIC_DEFAULT_TIMEOUT_MS,
  OPENAI_DEFAULT_MAX_RETRIES,
  OPENAI_DEFAULT_TIMEOUT_MS,
} from '../constants/llm';

export interface EnvConfig {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  TRUST_PROXY: number;
  DATABASE_URL?: string;

  JWT_SECRET: string;
  KAKAO_APP_ID?: number;
  GOOGLE_CLIENT_IDS: string[];
  APPLE_CLIENT_ID?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;

  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_BASE_URL?: string;
  ANTHROPIC_MAX_RETRIES: number;
  ANTHROPIC_TIMEOUT_MS: number;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_MAX_RETRIES: number;
  OPENAI_TIMEOUT_MS: number;

  RATE_LIMIT_PER_MINUTE: number;
  DAILY_REQUEST_LIMIT: number;
  DAILY_AUDIO_SECONDS_LIMIT: number;
  DAILY_BUDGET_USD: number;

  TERMS_URL?: string;
  PRIVACY_URL?: string;
}

export type AppConfigService = ConfigService<EnvConfig, true>;

const BLANK = Joi.string().pattern(/^\s*$/).allow('');
const str = () => Joi.string().trim().empty(BLANK);
const num = () => Joi.number().min(0).empty(BLANK);
const int = () => num().integer();
const requiredInProduction = <T extends Joi.Schema>(schema: T) =>
  schema.when(Env.NODE_ENV, {
    is: NodeEnv.PRODUCTION,
    then: Joi.required(),
  });

const rules: Record<EnvKey, Joi.Schema> = {
  [Env.NODE_ENV]: Joi.string()
    .valid('development', NodeEnv.PRODUCTION, NodeEnv.TEST)
    .empty(BLANK)
    .default('development'),
  [Env.PORT]: Joi.number().port().empty(BLANK).default(3000),
  [Env.TRUST_PROXY]: int().default(0),
  [Env.DATABASE_URL]: requiredInProduction(
    str().uri({ scheme: ['postgres', 'postgresql'] }),
  ),

  [Env.JWT_SECRET]: str().when(Env.NODE_ENV, {
    is: NodeEnv.PRODUCTION,
    then: Joi.string().min(32).required(),
    otherwise: Joi.string().default(DEV_JWT_SECRET),
  }),
  [Env.KAKAO_APP_ID]: int().positive(),
  [Env.GOOGLE_CLIENT_IDS]: str()
    .custom((v: string) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .default([]),
  [Env.APPLE_CLIENT_ID]: str(),
  [Env.APPLE_TEAM_ID]: str(),
  [Env.APPLE_KEY_ID]: str(),
  [Env.APPLE_PRIVATE_KEY]: str().custom((v: string) => v.replace(/\\n/g, '\n')),

  [Env.ANTHROPIC_API_KEY]: requiredInProduction(str()),
  [Env.ANTHROPIC_BASE_URL]: str().uri(),
  [Env.ANTHROPIC_MAX_RETRIES]: int().default(ANTHROPIC_DEFAULT_MAX_RETRIES),
  [Env.ANTHROPIC_TIMEOUT_MS]: int().default(ANTHROPIC_DEFAULT_TIMEOUT_MS),
  [Env.OPENAI_API_KEY]: requiredInProduction(str()),
  [Env.OPENAI_BASE_URL]: str().uri(),
  [Env.OPENAI_MAX_RETRIES]: int().default(OPENAI_DEFAULT_MAX_RETRIES),
  [Env.OPENAI_TIMEOUT_MS]: int().default(OPENAI_DEFAULT_TIMEOUT_MS),

  [Env.RATE_LIMIT_PER_MINUTE]: int().default(DEFAULT_LIMITS.ratePerMinute),
  [Env.DAILY_REQUEST_LIMIT]: int().default(DEFAULT_LIMITS.dailyRequests),
  [Env.DAILY_AUDIO_SECONDS_LIMIT]: int().default(
    DEFAULT_LIMITS.dailyAudioSeconds,
  ),
  [Env.DAILY_BUDGET_USD]: num().default(DEFAULT_LIMITS.dailyBudgetUsd),

  [Env.TERMS_URL]: str().uri({ scheme: ['https', 'http'] }),
  [Env.PRIVACY_URL]: str().uri({ scheme: ['https', 'http'] }),
};

export const envSchema = Joi.object<EnvConfig>(rules).unknown(true);

export function validateEnv(raw: Record<string, unknown>): EnvConfig {
  const result: Joi.ValidationResult<EnvConfig> = envSchema.validate(raw, {
    abortEarly: false,
  });
  if (result.error) {
    const lines = result.error.details.map((d) => `- ${d.message}`);
    throw new Error(`환경 변수가 올바르지 않아요:\n${lines.join('\n')}`);
  }
  return result.value;
}
