import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// 한 번에 분석할 수 있는 최대 글자 수.
// 앱의 입력 제한(analyze_home_screen.dart)과 문장 테이블 길이(sentences_table.dart)도 이 값에 맞춘다.
export const MAX_SENTENCE_LENGTH = 1000;

export class AnalyzeSentenceRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_SENTENCE_LENGTH)
  sentence: string;
}
