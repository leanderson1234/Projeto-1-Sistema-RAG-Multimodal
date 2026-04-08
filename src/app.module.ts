import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RagModule } from './module/rag/rag.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot(),
    RagModule
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
