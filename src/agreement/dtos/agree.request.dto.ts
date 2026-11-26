import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { AGREEMENT_VERSION_MAX_LENGTH } from '../../constants/agreement';
import { AgreementType } from '../../generated/prisma/enums';

export class AgreementItemDto {
  @IsEnum(AgreementType)
  type!: AgreementType;

  @IsString()
  @MaxLength(AGREEMENT_VERSION_MAX_LENGTH)
  version!: string;
}

export class AgreeRequestDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(Object.keys(AgreementType).length)
  @ValidateNested({ each: true })
  @Type(() => AgreementItemDto)
  agreements!: AgreementItemDto[];
}
