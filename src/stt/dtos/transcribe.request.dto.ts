import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  MAX_AUDIO_MS,
  MAX_TARGET_LENGTH,
  MIN_AUDIO_MS,
} from '../../constants/stt';

export class TranscribeRequestDto {
  @Type(() => Number)
  @IsInt()
  @Min(MIN_AUDIO_MS)
  @Max(MAX_AUDIO_MS)
  durationMs: number;

  @IsOptional()
  @IsString()
  @MaxLength(MAX_TARGET_LENGTH)
  target?: string;
}
