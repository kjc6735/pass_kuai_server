import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AnalyzeModule } from './analyze/analyze.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true
    }),
    AnalyzeModule,
    AuthModule
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
