import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const MAX_AUDIO_MS = 30_000;
export const MIN_AUDIO_MS = 300;

/** multipart 요청의 텍스트 필드. 파일은 `file` 필드로 따로 온다. */
export class TranscribeRequestDto {
  /** 앱이 잰 녹음 길이(ms). 하루 한도 계산에 쓴다. */
  @Type(() => Number)
  @IsInt()
  @Min(MIN_AUDIO_MS)
  @Max(MAX_AUDIO_MS)
  durationMs: number;

  /** 따라 읽은 목표 문장. 있으면 비교 결과를 함께 돌려준다. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  target?: string;
}
