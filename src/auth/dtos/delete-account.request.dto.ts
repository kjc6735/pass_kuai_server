import {
  Equals,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { DeleteReason } from '../../generated/prisma/enums';

export class DeleteAccountRequestDto {
  @Equals(true)
  confirm!: true;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  socialToken!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  authorizationCode?: string;

  @IsOptional()
  @IsEnum(DeleteReason)
  reason?: DeleteReason;
}
