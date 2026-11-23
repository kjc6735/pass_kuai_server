import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { PageQueryDto } from '../common/dtos/page.query.dto';
import type { RequestWithUser } from '../common/request-with-user';
import { parseId } from '../utils/parse-id';
import { SaveSentenceRequestDto } from './dtos/save-sentence.request.dto';
import { VocabSentenceService } from './vocab-sentence.service';

@Controller('vocab/sentences')
export class VocabSentenceController {
  constructor(private readonly sentences: VocabSentenceService) {}

  @Get()
  list(@Req() req: RequestWithUser, @Query() query: PageQueryDto) {
    return this.sentences.list(req.userId!, {
      cursor: query.cursor,
      limit: query.limit === undefined ? undefined : Number(query.limit),
    });
  }

  @Post()
  async save(
    @Req() req: RequestWithUser,
    @Body() dto: SaveSentenceRequestDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.sentences.saveFromAnalysis(req.userId!, dto);
    res.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: RequestWithUser, @Param('id') id: string) {
    await this.sentences.remove(req.userId!, parseId(id));
  }
}
