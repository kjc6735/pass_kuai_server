import { IsInt, IsUUID, Min } from 'class-validator';

export class SaveSentenceRequestDto {
  @IsUUID('all')
  analysisId: string;

  @IsInt()
  @Min(0)
  sentenceIndex: number;
}
