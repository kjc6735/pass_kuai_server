import { AgreementType } from '../generated/prisma/enums';

export const AGREEMENT_VERSIONS: Record<AgreementType, string> = {
  [AgreementType.terms]: '2026-11-26',
  [AgreementType.privacy]: '2026-11-26',
  [AgreementType.overseas_transfer]: '2026-11-26',
  [AgreementType.age_14]: '2026-11-26',
};

export const AGREEMENT_VERSION_MAX_LENGTH = 20;
export const UNAGREED_ACCOUNT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export const ALLOW_WITHOUT_AGREEMENT_KEY = 'allowWithoutAgreement';
