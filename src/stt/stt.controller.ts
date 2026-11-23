import {
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AppException } from '../common/errors/app.exception';
import type { RequestWithUser } from '../common/request-with-user';
import { TranscribeRequestDto } from './dtos/transcribe.request.dto';
import { SttService } from './stt.service';
import { ErrorCode } from '../constants/error-code';
import { ALLOWED_AUDIO_TYPES, MAX_AUDIO_BYTES } from '../constants/stt';

@Controller('stt')
export class SttController {
  constructor(private readonly stt: SttService) {}

  @Post('transcribe')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_AUDIO_BYTES, files: 1 },
    }),
  )
  transcribe(
    @Req() req: RequestWithUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: TranscribeRequestDto,
  ) {
    if (!file || file.size === 0)
      throw new AppException(ErrorCode.INVALID_INPUT, '녹음 파일이 없어요.');
    if (!ALLOWED_AUDIO_TYPES.test(file.mimetype)) {
      throw new AppException(
        ErrorCode.INVALID_INPUT,
        '지원하지 않는 녹음 형식이에요.',
      );
    }
    return this.stt.transcribe(
      req.userId!,
      {
        buffer: file.buffer,
        filename: file.originalname || 'speech.m4a',
        mimeType: file.mimetype,
      },
      Number(dto.durationMs),
      dto.target?.trim() || undefined,
    );
  }
}
