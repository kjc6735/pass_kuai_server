import { IsInt, IsUUID, Max, Min, ValidateIf } from 'class-validator';

const fromAnalysis = (o: SaveWordRequestDto) => o.sentenceId === undefined;
const fromSentence = (o: SaveWordRequestDto) => o.analysisId === undefined;

export class SaveWordRequestDto {
  @ValidateIf(fromAnalysis)
  @IsUUID('all')
  analysisId?: string;

  @ValidateIf(fromAnalysis)
  @IsInt()
  @Min(0)
  sentenceIndex?: number;

  @ValidateIf(fromAnalysis)
  @IsInt()
  @Min(0)
  wordIndex?: number;

  @ValidateIf(fromSentence)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  sentenceId?: number;

  @ValidateIf(fromSentence)
  @IsInt()
  @Min(0)
  position?: number;
}
