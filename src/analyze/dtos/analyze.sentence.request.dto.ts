import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { MAX_SENTENCE_LENGTH } from '../../constants/analyze';

export class AnalyzeSentenceRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_SENTENCE_LENGTH)
  sentence: string;
}
