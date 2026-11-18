import { IsNotEmpty, IsString } from "class-validator";



export class AnalyzeSentenceRequestDto {
  @IsString()
  @IsNotEmpty()
  sentence: string;
}