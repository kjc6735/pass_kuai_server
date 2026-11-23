import 'reflect-metadata';
import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  validateSync,
  ValidateNested,
  ValidationError,
} from 'class-validator';
import { ANALYZE_RESULT_LIMITS } from '../constants/analyze';
import { AnalyzeResult } from './types/analyze.result';

const L = ANALYZE_RESULT_LIMITS;

const Trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

const TrimOptional = () =>
  Transform(({ value }: { value: unknown }) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? undefined : trimmed;
  });

class SyllableDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(L.syllableHanzi)
  hanzi: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(L.syllablePinyin)
  pinyin: string;

  @IsInt()
  @Min(0)
  @Max(4)
  tone: number;
}

class WordDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(L.wordText)
  text: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(L.wordPinyin)
  pinyin: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(L.meaning)
  meaning: string;

  @TrimOptional()
  @IsOptional()
  @IsString()
  @MaxLength(L.pos)
  pos?: string;

  @IsArray()
  @ArrayMaxSize(L.syllablesPerWord)
  @ValidateNested({ each: true })
  @Type(() => SyllableDto)
  syllables: SyllableDto[];
}

class SentenceAnalysisDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(L.sentence)
  sentence: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(L.translation)
  translation: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(L.wordsPerSentence)
  @ValidateNested({ each: true })
  @Type(() => WordDto)
  words: WordDto[];
}

class AnalyzeResultDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(L.sentences)
  @ValidateNested({ each: true })
  @Type(() => SentenceAnalysisDto)
  sentences: SentenceAnalysisDto[];
}

export type AnalyzeResultIssueKind = 'tooLong' | 'malformed';

export interface AnalyzeResultIssue {
  path: string;
  constraint: string;
  kind: AnalyzeResultIssueKind;
}

export type AnalyzeResultValidation =
  | { ok: true; value: AnalyzeResult }
  | { ok: false; kind: AnalyzeResultIssueKind; issues: AnalyzeResultIssue[] };

const TOO_LONG_CONSTRAINTS = new Set(['maxLength', 'arrayMaxSize']);

export function sentencePinyin(words: { pinyin: string }[]): string {
  return words.map((w) => w.pinyin).join(' ');
}

export function validateAnalyzeResult(raw: unknown): AnalyzeResultValidation {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      ok: false,
      kind: 'malformed',
      issues: [{ path: '(root)', constraint: 'isObject', kind: 'malformed' }],
    };
  }

  const dto = plainToInstance(AnalyzeResultDto, raw);
  const errors = validateSync(dto, {
    whitelist: true,
    forbidUnknownValues: true,
  });

  const issues = flattenErrors(errors);

  if (issues.length === 0) {
    dto.sentences.forEach((s, i) => {
      if (sentencePinyin(s.words).length > L.sentencePinyin) {
        issues.push({
          path: `sentences[${i}].(pinyin join)`,
          constraint: 'maxLength',
          kind: 'tooLong',
        });
      }
    });
  }

  if (issues.length > 0) {
    const kind = issues.some((i) => i.kind === 'malformed')
      ? 'malformed'
      : 'tooLong';
    return { ok: false, kind, issues };
  }

  return { ok: true, value: dto };
}

function flattenErrors(
  errors: ValidationError[],
  parent = '',
): AnalyzeResultIssue[] {
  const out: AnalyzeResultIssue[] = [];
  for (const e of errors) {
    const path = /^\d+$/.test(e.property)
      ? `${parent}[${e.property}]`
      : parent
        ? `${parent}.${e.property}`
        : e.property;
    for (const constraint of Object.keys(e.constraints ?? {})) {
      out.push({
        path,
        constraint,
        kind: TOO_LONG_CONSTRAINTS.has(constraint) ? 'tooLong' : 'malformed',
      });
    }
    if (e.children?.length) out.push(...flattenErrors(e.children, path));
  }
  return out;
}
