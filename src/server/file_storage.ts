/**
 * @fileoverview Handles multipart file uploads and image asset disk storage.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import multer from 'multer';

export class FileStorageManager {
  private imagesDirectory: string;

  /**
   * @param imagesDirectory Writable directory receiving uploaded achievement images.
   */
  public constructor(imagesDirectory: string) {
    this.imagesDirectory = imagesDirectory;
    this.ensureImagesDirectoryExists();
  }

  /**
   * Copies the packaged default badge into the writable images directory
   * so `/images/default_badge.svg` keeps resolving after a fresh install.
   */
  public seedDefaultBadge(sourcePath: string): void {
    this.ensureImagesDirectoryExists();
    const targetPath = path.join(this.imagesDirectory, path.basename(sourcePath));
    if (fs.existsSync(sourcePath) && !fs.existsSync(targetPath)) {
      try {
        fs.copyFileSync(sourcePath, targetPath);
      } catch (seedError) {
        console.error('CRITICAL: Failed to seed default badge image:', seedError);
      }
    }
  }

  private ensureImagesDirectoryExists(): void {
    if (!fs.existsSync(this.imagesDirectory)) {
      fs.mkdirSync(this.imagesDirectory, { recursive: true });
    }
  }

  public getImagesDirectory(): string {
    return this.imagesDirectory;
  }

  public createMulterUploader(): multer.Multer {
    const storageConfig = multer.diskStorage({
      destination: (_request, _file, callback) => {
        this.ensureImagesDirectoryExists();
        callback(null, this.imagesDirectory);
      },
      filename: (_request, file, callback) => {
        const sanitizedBaseName = path
          .parse(file.originalname)
          .name.toLowerCase()
          .replace(/[^a-z0-9_-]/g, '_');
        const extension = path.extname(file.originalname).toLowerCase() || '.png';
        const uniqueFileName = `${Date.now()}-${sanitizedBaseName}${extension}`;
        callback(null, uniqueFileName);
      },
    });

    const fileFilter: multer.Options['fileFilter'] = (_request, file, callback) => {
      const allowedExtensions = ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.gif'];
      const fileExtension = path.extname(file.originalname).toLowerCase();
      if (allowedExtensions.includes(fileExtension)) {
        callback(null, true);
      } else {
        callback(new Error(`Unsupported image format. Allowed: ${allowedExtensions.join(', ')}`));
      }
    };

    return multer({
      storage: storageConfig,
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter,
    });
  }
}
