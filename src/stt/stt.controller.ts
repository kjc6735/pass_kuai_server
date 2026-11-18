import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { RequestWithDevice } from '../common/request-with-device';
import { TranscribeRequestDto } from './dtos/transcribe.request.dto';
import { SttService } from './stt.service';

export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES =
  /^(audio\/(mp4|m4a|x-m4a|aac|mpeg|mp3|wav|x-wav|webm|ogg)|video\/mp4)$/;

@Controller('stt')
export class SttController {
  constructor(private readonly stt: SttService) {}

  /** 녹음 파일 하나를 글자로 바꾼다. 목표 문장을 주면 병음으로 비교한 결과도 함께 준다. */
  @Post('transcribe')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_AUDIO_BYTES, files: 1 },
    }),
  )
  transcribe(
    @Req() req: RequestWithDevice,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: TranscribeRequestDto,
  ) {
    if (!file || file.size === 0)
      throw new BadRequestException('녹음 파일(file)이 없어요.');
    if (!ALLOWED_TYPES.test(file.mimetype)) {
      throw new BadRequestException(
        `지원하지 않는 형식이에요: ${file.mimetype}`,
      );
    }
    return this.stt.transcribe(
      req.deviceId!,
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
