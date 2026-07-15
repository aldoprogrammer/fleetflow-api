import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderPhotoType } from '@prisma/client';
import { v2 as cloudinary } from 'cloudinary';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
]);

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);
const MIN_IMAGE_BYTES = 1024;

@Injectable()
export class PhotoStorageService {
  private readonly logger = new Logger(PhotoStorageService.name);
  private readonly cloudinaryEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    this.cloudinaryEnabled = Boolean(cloudName && apiKey && apiSecret);

    if (this.cloudinaryEnabled) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
    } else {
      this.logger.warn(
        'Cloudinary credentials missing — proof photos will be stored locally under uploads/.',
      );
    }
  }

  assertValidImageFile(file: Express.Multer.File): void {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Photo file is required.');
    }

    if (file.buffer.length < MIN_IMAGE_BYTES) {
      throw new BadRequestException(
        'Photo file is too small or corrupt. Choose a valid JPG or PNG image.',
      );
    }

    const mime = file.mimetype?.toLowerCase() ?? '';
    const extension = this.resolveExtension(file.originalname);

    if (!ALLOWED_MIME_TYPES.has(mime) && !ALLOWED_EXTENSIONS.has(extension)) {
      throw new BadRequestException(
        'Unsupported image format. Use JPG, JPEG, or PNG.',
      );
    }
  }

  async uploadOrderPhoto(
    orderId: string,
    type: OrderPhotoType,
    file: Express.Multer.File,
  ): Promise<string> {
    this.assertValidImageFile(file);

    const folder = this.resolveFolder(orderId, type);

    if (this.cloudinaryEnabled) {
      return this.uploadToCloudinary(folder, file);
    }

    return this.uploadToLocalDisk(folder, file);
  }

  private resolveFolder(orderId: string, type: OrderPhotoType): string {
    const segment =
      type === OrderPhotoType.DEPARTURE ? 'departures' : 'deliveries';
    const baseFolder =
      this.configService.get<string>('CLOUDINARY_UPLOAD_FOLDER') ?? 'fleetflow';
    return `${baseFolder}/${segment}/booking-${orderId}`;
  }

  private resolveExtension(filename: string): string {
    const dot = filename.lastIndexOf('.');
    if (dot < 0) {
      return '';
    }
    return filename.slice(dot).toLowerCase();
  }

  private async uploadToCloudinary(
    folder: string,
    file: Express.Multer.File,
  ): Promise<string> {
    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
        },
        (error, uploadResult) => {
          if (error || !uploadResult?.secure_url) {
            reject(error ?? new Error('Cloudinary upload returned no URL.'));
            return;
          }
          resolve({ secure_url: uploadResult.secure_url });
        },
      );

      stream.end(file.buffer);
    });

    return result.secure_url;
  }

  private async uploadToLocalDisk(
    folder: string,
    file: Express.Multer.File,
  ): Promise<string> {
    const extension = this.resolveExtension(file.originalname) || '.jpg';
    const filename = `${Date.now()}${extension}`;
    const relativePath = join(folder, filename);
    const absoluteDir = join(process.cwd(), 'uploads', folder);
    const absolutePath = join(absoluteDir, filename);

    await mkdir(absoluteDir, { recursive: true });
    await writeFile(absolutePath, file.buffer);

    const publicBase =
      this.configService.get<string>('API_PUBLIC_URL') ??
      `http://localhost:${this.configService.get<string>('PORT', '3000')}`;

    return `${publicBase.replace(/\/$/, '')}/uploads/${relativePath.replace(/\\/g, '/')}`;
  }
}
