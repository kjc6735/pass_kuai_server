import type { AgreementType } from '../../generated/prisma/enums';

export interface RequiredAgreement {
  type: AgreementType;
  version: string;
  url: string | null;
  agreed: boolean;
}

export interface AgreementStatus {
  required: RequiredAgreement[];
}
