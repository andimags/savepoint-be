import { createHash } from 'node:crypto';

import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface CloudinaryConfig {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

interface CloudinaryUploadResponse {
  secure_url?: string;
}

/**
 * Uploads images to Cloudinary with a server-side signed request so the API secret never reaches
 * the browser. Uses Cloudinary's REST endpoint directly to avoid pulling in the SDK.
 */
@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private static readonly AVATAR_FOLDER = 'savepoint/avatars';

  constructor(private readonly configService: ConfigService) {}

  get isConfigured(): boolean {
    return Boolean(
      this.configService.get<string>('CLOUDINARY_CLOUD_NAME') &&
        this.configService.get<string>('CLOUDINARY_API_KEY') &&
        this.configService.get<string>('CLOUDINARY_API_SECRET'),
    );
  }

  /** Uploads an avatar keyed by the user id so re-uploads overwrite the previous image. */
  async uploadAvatar(dataUri: string, userId: string): Promise<string> {
    const { cloudName, apiKey, apiSecret } = this.requireConfig();
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = CloudinaryService.AVATAR_FOLDER;
    const overwrite = 'true';
    const publicId = userId;

    // Cloudinary signs the alphabetically-sorted signed params (file and api_key excluded),
    // joined with '&', with the api secret appended before hashing.
    const signature = createHash('sha1')
      .update(
        `folder=${folder}&overwrite=${overwrite}&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`,
      )
      .digest('hex');

    const form = new FormData();
    form.append('file', dataUri);
    form.append('api_key', apiKey);
    form.append('timestamp', String(timestamp));
    form.append('folder', folder);
    form.append('public_id', publicId);
    form.append('overwrite', overwrite);
    form.append('signature', signature);

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
      method: 'POST',
      body: form,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      this.logger.error(`Cloudinary upload failed (${response.status}): ${detail}`);
      throw new InternalServerErrorException('Failed to upload image');
    }

    const body = (await response.json()) as CloudinaryUploadResponse;
    if (!body.secure_url) {
      throw new InternalServerErrorException('Image upload returned no URL');
    }
    return body.secure_url;
  }

  private requireConfig(): CloudinaryConfig {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');
    if (!cloudName || !apiKey || !apiSecret) {
      throw new InternalServerErrorException('Image uploads are not configured');
    }
    return { cloudName, apiKey, apiSecret };
  }
}
