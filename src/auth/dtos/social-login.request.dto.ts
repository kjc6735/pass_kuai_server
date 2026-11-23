import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SocialLoginRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  token!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  authorizationCode?: string;
}
