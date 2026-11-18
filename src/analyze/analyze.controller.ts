import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RequestWithDevice } from '../common/request-with-device';
import { DailyLimitGuard } from '../usage/daily-limit.guard';
import { AnalyzeService } from './analyze.service';
import { AnalyzeSentenceRequestDto } from './dtos/analyze.sentence.request.dto';
import { AnalyzeWordRequestDto } from './dtos/analyze.word.request.dto';

@Controller('analyze')
@UseGuards(DailyLimitGuard)
export class AnalyzeController {
  constructor(private readonly analyzeService: AnalyzeService) {}

  // 무언가를 만드는 요청이 아니라서 Nest의 POST 기본값(201) 대신 200을 돌려준다.
  @Post('sentence')
  @HttpCode(200)
  analyzeSentence(
    @Body() dto: AnalyzeSentenceRequestDto,
    @Req() req: RequestWithDevice,
  ) {
    return this.analyzeService.analyzeSentence({
      ...dto,
      deviceId: req.deviceId,
    });
  }

  @Post('word')
  @HttpCode(200)
  lookupWord(
    @Body() dto: AnalyzeWordRequestDto,
    @Req() req: RequestWithDevice,
  ) {
    return this.analyzeService.lookupWord({ ...dto, deviceId: req.deviceId });
  }
}
