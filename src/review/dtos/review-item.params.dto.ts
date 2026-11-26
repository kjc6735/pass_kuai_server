import { IsIn, IsString } from 'class-validator';
import { ReviewMode } from '../../constants/review';

export class ReviewItemParamsDto {
  @IsIn(Object.values(ReviewMode))
  mode!: ReviewMode;

  @IsString()
  itemId!: string;
}
