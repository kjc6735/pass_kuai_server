import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  MAX_WORD_CONTEXT_LENGTH,
  MAX_WORD_LENGTH,
} from '../../constants/analyze';

export class AnalyzeWordRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(MAX_WORD_CONTEXT_LENGTH)
  context?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(MAX_WORD_LENGTH)
  word!: string;
}
