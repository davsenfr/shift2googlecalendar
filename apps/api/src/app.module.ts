import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'node:path';
import { AuthController } from './auth/auth.controller';
import { GoogleAuthService } from './auth/google-auth.service';
import { TokenStoreService } from './auth/token-store.service';
import { CalendarController } from './calendar/calendar.controller';
import { CalendarService } from './calendar/calendar.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', '..', 'web', 'dist'),
      exclude: ['/api/{*path}'],
    }),
  ],
  controllers: [AuthController, CalendarController],
  providers: [TokenStoreService, GoogleAuthService, CalendarService],
})
export class AppModule {}
