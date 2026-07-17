import { Controller, Delete, Get, Query, Redirect, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { GoogleAuthService } from './google-auth.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly googleAuth: GoogleAuthService,
    private readonly config: ConfigService,
  ) {}

  @Get('status')
  status() {
    return this.googleAuth.getStatus();
  }

  @Get('google')
  @Redirect()
  connect() {
    return { url: this.googleAuth.createAuthorizationUrl(), statusCode: 302 };
  }

  @Get('google/callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() response: Response,
  ) {
    await this.googleAuth.handleCallback(code, state);
    return response.redirect(`${this.config.get('WEB_URL', 'http://localhost:5173')}/?google=connected`);
  }

  @Delete('google')
  async disconnect() {
    await this.googleAuth.disconnect();
    return { connected: false };
  }
}
