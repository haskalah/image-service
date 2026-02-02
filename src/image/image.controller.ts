import {
    Body, Controller, Delete, Get, Param, Patch, Post, Query,
    Req, Res, UploadedFile, UseGuards, UseInterceptors
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ApiKeyGuard, RequirePermission } from '../auth/api-key.guard';
import { API_KEY_PERMISSIONS } from 'imagelib';
import { ImageService } from './image.service';
import { RequestWithApiKey } from '../types';

@Controller('image')
@UseGuards(ApiKeyGuard)
export class ImageController {
    constructor(private readonly imageService: ImageService) {}

    @Post('upload')
    @RequirePermission(API_KEY_PERMISSIONS.WRITE)
    @UseInterceptors(FileInterceptor('file', {
        limits: { fileSize: 10 * 1024 * 1024 }
    }))
    async upload(
        @Req() req: RequestWithApiKey,
        @UploadedFile() file: Express.Multer.File,
        @Body('tags') tags: string,
        @Body('description') description: string,
        @Body('alt') alt: string
    ) {
        const parsedTags = tags ? JSON.parse(tags) : [];
        return this.imageService.upload(
            req.apiKey.AppName,
            req.apiKey.AppName,
            file,
            { tags: parsedTags, description, alt }
        );
    }

    @Get(':imageID')
    @RequirePermission(API_KEY_PERMISSIONS.READ)
    async getByID(@Param('imageID') imageID: string) {
        return this.imageService.getByID(imageID);
    }

    @Get(':imageID/file')
    @RequirePermission(API_KEY_PERMISSIONS.READ)
    async getFile(@Param('imageID') imageID: string, @Res() res: Response) {
        const filePath = await this.imageService.getFilePath(imageID);
        const image = await this.imageService.getByID(imageID);
        res.setHeader('Content-Type', image.MimeType);
        res.sendFile(filePath);
    }

    @Get()
    @RequirePermission(API_KEY_PERMISSIONS.READ)
    async list(
        @Req() req: RequestWithApiKey,
        @Query('page') page: string,
        @Query('limit') limit: string,
        @Query('tags') tags: string,
        @Query('search') search: string
    ) {
        return this.imageService.list(req.apiKey.AppName, {
            page: page ? parseInt(page) : 1,
            limit: limit ? parseInt(limit) : 20,
            tags: tags ? tags.split(',') : undefined,
            search
        });
    }

    @Patch(':imageID')
    @RequirePermission(API_KEY_PERMISSIONS.WRITE)
    async update(
        @Param('imageID') imageID: string,
        @Body() body: { tags?: string[]; description?: string; alt?: string }
    ) {
        return this.imageService.updateMetadata(imageID, body);
    }

    @Delete(':imageID')
    @RequirePermission(API_KEY_PERMISSIONS.DELETE)
    async delete(@Param('imageID') imageID: string) {
        await this.imageService.delete(imageID);
        return { success: true };
    }
}
