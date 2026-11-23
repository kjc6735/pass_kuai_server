import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseInterceptors,
} from '@nestjs/common';
import type { RequestWithUser } from '../common/request-with-user';
import { DailyLimitInterceptor } from '../usage/daily-limit.interceptor';
import { AnalyzeService } from './analyze.service';
import { AnalyzeSentenceRequestDto } from './dtos/analyze.sentence.request.dto';
import { AnalyzeWordRequestDto } from './dtos/analyze.word.request.dto';

@Controller('analyze')
@UseInterceptors(DailyLimitInterceptor)
export class AnalyzeController {
  constructor(private readonly analyzeService: AnalyzeService) {}

  @Post('sentence')
  @HttpCode(200)
  analyzeSentence(
    @Body() dto: AnalyzeSentenceRequestDto,
    @Req() req: RequestWithUser,
  ) {
    return this.analyzeService.analyzeSentence({
      ...dto,
      userId: req.userId!,
    });
  }

  @Post('word')
  @HttpCode(200)
  lookupWord(@Body() dto: AnalyzeWordRequestDto, @Req() req: RequestWithUser) {
    return this.analyzeService.lookupWord({ ...dto, userId: req.userId });
  }
}
