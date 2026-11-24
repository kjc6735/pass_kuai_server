import { IsIn, IsInt, Max, Min } from 'class-validator';
import { ItemType, ReviewMode, ReviewResult } from '../../constants/review';

export class ReviewLogRequestDto {
  @IsIn(Object.values(ReviewMode))
  mode!: ReviewMode;

  @IsIn(Object.values(ItemType))
  itemType!: ItemType;

  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  itemId!: number;

  @IsIn(Object.values(ReviewResult))
  result!: ReviewResult;
}
