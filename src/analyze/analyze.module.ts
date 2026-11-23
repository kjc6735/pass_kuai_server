import { Module } from '@nestjs/common';
import { AnalysisResultService } from './analysis-result.service';
import { AnalyzeController } from './analyze.controller';
import { AnalyzeService } from './analyze.service';

@Module({
  controllers: [AnalyzeController],
  providers: [AnalyzeService, AnalysisResultService],
  exports: [AnalysisResultService],
})
export class AnalyzeModule {}
