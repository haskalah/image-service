import { Module } from '@nestjs/common';
import { ImageController } from './image/image.controller';
import { ImageService } from './image/image.service';

@Module({
    imports: [],
    controllers: [
        ImageController,
    ],
    providers: [
        ImageService,
    ],
})
export class AppModule {}
