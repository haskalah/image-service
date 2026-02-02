import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import "dotenv/config";
import { connect } from "imagelib/schemas";
import { json, urlencoded } from "express";
import fs from "fs";

async function bootstrap() {
    await connect(process.env.MONGODB_URI);

    const uploadDir = process.env.IMAGE_DIR || './uploads';
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
    }

    const app = await NestFactory.create(AppModule);
    app.use(json({ limit: '32mb' }));
    app.use(urlencoded({ extended: true, limit: '32mb' }));
    app.enableCors();
    await app.listen(process.env.PORT || 3120);
}

bootstrap();
