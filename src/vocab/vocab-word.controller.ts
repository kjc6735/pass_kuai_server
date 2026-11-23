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
import { SaveWordRequestDto } from './dtos/save-word.request.dto';
import { VocabWordService } from './vocab-word.service';

@Controller('vocab/words')
export class VocabWordController {
  constructor(private readonly words: VocabWordService) {}

  @Get()
  list(@Req() req: RequestWithUser, @Query() query: PageQueryDto) {
    return this.words.list(req.userId!, {
      cursor: query.cursor,
      limit: query.limit === undefined ? undefined : Number(query.limit),
    });
  }

  @Post()
  async save(
    @Req() req: RequestWithUser,
    @Body() dto: SaveWordRequestDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.words.save(req.userId!, dto);
    res.status(result.created ? HttpStatus.CREATED : HttpStatus.OK);
    return result;
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() req: RequestWithUser, @Param('id') id: string) {
    await this.words.remove(req.userId!, parseId(id));
  }
}
