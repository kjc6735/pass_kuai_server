import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RefreshTokenRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  refreshToken!: string;
}
