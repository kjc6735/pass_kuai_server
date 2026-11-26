import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import type { RequestWithUser } from '../common/request-with-user';
import { parseId } from '../utils/parse-id';
import { ReviewDueQueryDto } from './dtos/review-due.query.dto';
import { ReviewItemParamsDto } from './dtos/review-item.params.dto';
import { ReviewLogRequestDto } from './dtos/review-log.request.dto';
import { ReviewService } from './review.service';

@Controller('me/review')
export class ReviewController {
  constructor(private readonly review: ReviewService) {}

  @Get('summary')
  summary(@Req() req: RequestWithUser) {
    return this.review.summary(req.userId!);
  }

  @Get('due')
  due(@Req() req: RequestWithUser, @Query() query: ReviewDueQueryDto) {
    return this.review.due(
      req.userId!,
      query.mode,
      query.limit === undefined ? undefined : Number(query.limit),
    );
  }

  @Post('logs')
  @HttpCode(200)
  record(@Req() req: RequestWithUser, @Body() dto: ReviewLogRequestDto) {
    return this.review.record(req.userId!, dto);
  }

  @Put(':mode/:itemId/suspend')
  @HttpCode(HttpStatus.NO_CONTENT)
  async suspend(
    @Req() req: RequestWithUser,
    @Param() { mode, itemId }: ReviewItemParamsDto,
  ) {
    await this.review.suspend(req.userId!, mode, parseId(itemId));
  }

  @Delete(':mode/:itemId/suspend')
  @HttpCode(HttpStatus.NO_CONTENT)
  async resume(
    @Req() req: RequestWithUser,
    @Param() { mode, itemId }: ReviewItemParamsDto,
  ) {
    await this.review.resume(req.userId!, mode, parseId(itemId));
  }
}
