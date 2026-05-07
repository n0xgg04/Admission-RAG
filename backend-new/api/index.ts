import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import { AppModule } from '../src/app.module';

const server = express();

async function bootstrap() {
  const adapter = new ExpressAdapter(server);
  const app = await NestFactory.create(AppModule, adapter);
  app.enableCors();
  await app.init();
}

bootstrap();

export default server;
