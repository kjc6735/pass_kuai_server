import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

const DEV_SECRET = 'dev-only-secret-change-me';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) {
          if (config.get<string>('NODE_ENV') === 'production') {
            throw new Error('JWT_SECRET이 설정되지 않았습니다.');
          }
          new Logger('AuthModule').warn(
            'JWT_SECRET이 없어 개발용 값을 씁니다. 배포 환경에서는 반드시 설정하세요.',
          );
        }
        return {
          secret: secret || DEV_SECRET,
          signOptions: { expiresIn: '365d' },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [AuthService, AuthGuard],
})
export class AuthModule {}
