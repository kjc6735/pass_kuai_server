import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class AnalyzeWordRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  context?: string;

  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  word!: string;
}