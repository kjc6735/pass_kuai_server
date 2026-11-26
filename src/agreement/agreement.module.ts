import { Module } from '@nestjs/common';
import { AgreementController } from './agreement.controller';
import { AgreementGuard } from './agreement.guard';
import { AgreementService } from './agreement.service';

@Module({
  controllers: [AgreementController],
  providers: [AgreementService, AgreementGuard],
  exports: [AgreementService, AgreementGuard],
})
export class AgreementModule {}
