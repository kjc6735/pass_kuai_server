import { Controller, Post, Query } from '@nestjs/common';

@Controller('auth')
export class AuthController {

  @Post("google")
  googleLogin(
    @Query('code') code: string
  ){

  }


}
