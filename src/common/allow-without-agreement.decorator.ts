import { SetMetadata } from '@nestjs/common';
import { ALLOW_WITHOUT_AGREEMENT_KEY } from '../constants/agreement';

export const AllowWithoutAgreement = () =>
  SetMetadata(ALLOW_WITHOUT_AGREEMENT_KEY, true);
