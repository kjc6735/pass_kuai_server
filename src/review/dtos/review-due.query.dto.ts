import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { REVIEW_DAILY_LIMIT, ReviewMode } from '../../constants/review';

export class ReviewDueQueryDto {
  @IsIn(Object.values(ReviewMode))
  mode!: ReviewMode;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(REVIEW_DAILY_LIMIT)
  limit?: number;
}
