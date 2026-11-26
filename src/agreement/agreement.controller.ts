import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { AllowWithoutAgreement } from '../common/allow-without-agreement.decorator';
import type { RequestWithUser } from '../common/request-with-user';
import { AgreementService } from './agreement.service';
import { AgreeRequestDto } from './dtos/agree.request.dto';

@AllowWithoutAgreement()
@Controller('me/agreements')
export class AgreementController {
  constructor(private readonly agreements: AgreementService) {}

  @Get()
  status(@Req() req: RequestWithUser) {
    return this.agreements.status(req.userId!);
  }

  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async agree(@Req() req: RequestWithUser, @Body() dto: AgreeRequestDto) {
    await this.agreements.agree(req.userId!, dto.agreements);
  }
}
