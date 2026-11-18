import { Body, Controller, Post } from '@nestjs/common';
import { AnalyzeSentenceRequestDto } from './dtos/analyze.sentence.request.dto';
import { AnalyzeWordRequestDto } from './dtos/analyze.word.request.dto';
import { AnalyzeService } from './analyze.service';

@Controller('analyze')
export class AnalyzeController {

  constructor(
    private readonly analyzeService: AnalyzeService
  ){}


  @Post("sentence")
  analyzeSentence(
    @Body() analyzeSentenceRequestDto: AnalyzeSentenceRequestDto,
  ){

    return this.analyzeService.analyzeSentence({ ...analyzeSentenceRequestDto });
  }

  @Post("word")
  lookupWord(
    @Body() analyzeWordRequestDto: AnalyzeWordRequestDto,
  ){
    return this.analyzeService.lookupWord({
      ...analyzeWordRequestDto
    })
  }

}
