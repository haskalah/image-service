import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ImageModel } from 'imagelib/schemas';
import { IImage, IMAGE_STATUS, MIME_TYPES } from 'imagelib';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

@Injectable()
export class ImageService {
    private getUploadDir(): string {
        return path.resolve(process.env.IMAGE_DIR || './uploads');
    }

    private getAppDir(appID: string): string {
        const dir = path.join(this.getUploadDir(), appID);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        return dir;
    }

    async upload(
        appID: string,
        uploadedBy: string,
        file: Express.Multer.File,
        metadata: { tags?: string[]; description?: string; alt?: string }
    ): Promise<IImage> {
        if (!file) {
            throw new BadRequestException('No file provided');
        }

        if (!MIME_TYPES.includes(file.mimetype)) {
            throw new BadRequestException(`Unsupported file type: ${file.mimetype}. Supported: ${MIME_TYPES.join(', ')}`);
        }

        const imageID = crypto.randomUUID();
        const ext = path.extname(file.originalname) || this.getExtFromMime(file.mimetype);
        const fileName = `${imageID}${ext}`;
        const filePath = path.join(this.getAppDir(appID), fileName);

        fs.writeFileSync(filePath, file.buffer);

        const image = new ImageModel({
            ImageID: imageID,
            AppID: appID,
            FileName: fileName,
            OriginalFileName: file.originalname,
            MimeType: file.mimetype,
            Size: file.size,
            Tags: metadata.tags || [],
            Description: metadata.description || '',
            Alt: metadata.alt || '',
            Status: IMAGE_STATUS.ACTIVE,
            UploadedBy: uploadedBy
        }) as IImage;

        await image.save();
        return image;
    }

    async getByID(imageID: string): Promise<IImage> {
        const image = await ImageModel.findOne({ ImageID: imageID, Status: IMAGE_STATUS.ACTIVE }) as IImage;
        if (!image) throw new NotFoundException('Image not found');
        return image;
    }

    async getFilePath(imageID: string): Promise<string> {
        const image = await this.getByID(imageID);
        const filePath = path.join(this.getAppDir(image.AppID), image.FileName);
        if (!fs.existsSync(filePath)) {
            throw new NotFoundException('Image file not found on disk');
        }
        return filePath;
    }

    async list(appID: string, options: { page?: number; limit?: number; tags?: string[]; search?: string }): Promise<{ images: IImage[]; total: number }> {
        const page = options.page || 1;
        const limit = Math.min(options.limit || 20, 100);
        const skip = (page - 1) * limit;

        const filter: any = { AppID: appID, Status: IMAGE_STATUS.ACTIVE };
        if (options.tags?.length) {
            filter.Tags = { $in: options.tags };
        }
        if (options.search) {
            filter.$or = [
                { Description: { $regex: options.search, $options: 'i' } },
                { OriginalFileName: { $regex: options.search, $options: 'i' } },
                { Alt: { $regex: options.search, $options: 'i' } }
            ];
        }

        const [images, total] = await Promise.all([
            ImageModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
            ImageModel.countDocuments(filter)
        ]);

        return { images: images as IImage[], total };
    }

    async updateMetadata(imageID: string, updates: { tags?: string[]; description?: string; alt?: string }): Promise<IImage> {
        const image = await this.getByID(imageID);
        const setFields: any = {};
        if (updates.tags !== undefined) setFields.Tags = updates.tags;
        if (updates.description !== undefined) setFields.Description = updates.description;
        if (updates.alt !== undefined) setFields.Alt = updates.alt;

        await ImageModel.updateOne({ ImageID: imageID }, { $set: setFields });
        return await ImageModel.findOne({ ImageID: imageID }) as IImage;
    }

    async delete(imageID: string): Promise<void> {
        const image = await this.getByID(imageID);
        await ImageModel.updateOne({ ImageID: imageID }, { $set: { Status: IMAGE_STATUS.DELETED } });

        const filePath = path.join(this.getAppDir(image.AppID), image.FileName);
        if (fs.existsSync(filePath)) {
            fs.rmSync(filePath);
        }
    }

    private getExtFromMime(mime: string): string {
        const map: Record<string, string> = {
            'image/png': '.png',
            'image/jpeg': '.jpg',
            'image/webp': '.webp',
            'image/gif': '.gif',
            'image/svg+xml': '.svg'
        };
        return map[mime] || '.bin';
    }
}
