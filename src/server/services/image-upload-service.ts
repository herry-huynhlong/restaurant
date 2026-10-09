import crypto from "node:crypto";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";
import type { Sharp } from "sharp";

export const MAX_UPLOAD_IMAGE_SIZE = 5 * 1024 * 1024;
export const allowedUploadImageTypes = ["image/jpeg", "image/png", "image/webp"];

const MAX_OUTPUT_SIZE = 1024 * 1024;
const THUMBNAIL_MAX_OUTPUT_SIZE = 150 * 1024;

type UploadFolder = "products" | "logos" | "payments";

type ProcessedImage = {
  imageUrl: string;
  thumbnailUrl: string;
  originalSize: number;
  optimizedSize: number;
  thumbnailSize: number;
};

export function validateUploadImageFile(file: File) {
  if (!allowedUploadImageTypes.includes(file.type)) {
    throw new Error("INVALID_IMAGE_TYPE");
  }
  if (file.size > MAX_UPLOAD_IMAGE_SIZE) {
    throw new Error("INVALID_IMAGE_SIZE");
  }
}

export async function saveOptimizedUploadImage(file: File, folder: UploadFolder): Promise<ProcessedImage | undefined> {
  if (!(file instanceof File) || file.size === 0) return undefined;
  validateUploadImageFile(file);

  const input = Buffer.from(await file.arrayBuffer());
  const image = sharp(input, { failOn: "none" }).rotate();
  const baseName = `${Date.now()}-${crypto.randomUUID()}`;
  const uploadDir = path.join(process.cwd(), "public", "uploads", folder);
  await mkdir(uploadDir, { recursive: true });

  const optimized = await renderBoundedWebp(image.clone(), {
    maxDimension: 1200,
    maxBytes: MAX_OUTPUT_SIZE,
    initialQuality: 80,
    minQuality: 50
  });
  const thumbnail = await renderBoundedWebp(image.clone(), {
    maxDimension: 300,
    maxBytes: THUMBNAIL_MAX_OUTPUT_SIZE,
    initialQuality: 75,
    minQuality: 55
  });

  const imageName = `${baseName}.webp`;
  const thumbnailName = `${baseName}-thumb.webp`;
  await Promise.all([
    writeFile(path.join(uploadDir, imageName), optimized.buffer),
    writeFile(path.join(uploadDir, thumbnailName), thumbnail.buffer)
  ]);

  console.info("IMAGE OPTIMIZED", {
    folder,
    originalSize: file.size,
    optimizedSize: optimized.buffer.length,
    thumbnailSize: thumbnail.buffer.length,
    optimizedWidth: optimized.width,
    optimizedHeight: optimized.height,
    thumbnailWidth: thumbnail.width,
    thumbnailHeight: thumbnail.height
  });

  return {
    imageUrl: `/api/uploads/${folder}/${imageName}`,
    thumbnailUrl: `/api/uploads/${folder}/${thumbnailName}`,
    originalSize: file.size,
    optimizedSize: optimized.buffer.length,
    thumbnailSize: thumbnail.buffer.length
  };
}

async function renderBoundedWebp(
  source: Sharp,
  {
    maxDimension,
    maxBytes,
    initialQuality,
    minQuality
  }: {
    maxDimension: number;
    maxBytes: number;
    initialQuality: number;
    minQuality: number;
  }
) {
  const dimensions = [maxDimension, Math.round(maxDimension * 0.85), Math.round(maxDimension * 0.7), Math.round(maxDimension * 0.55)];
  let best: { buffer: Buffer; width?: number; height?: number } | null = null;

  for (const dimension of dimensions) {
    for (let quality = initialQuality; quality >= minQuality; quality -= 10) {
      const buffer = await source
        .clone()
        .resize({ width: dimension, height: dimension, fit: "inside", withoutEnlargement: true })
        .webp({ quality, effort: 5 })
        .toBuffer();
      const metadata = await sharp(buffer).metadata();
      const candidate = { buffer, width: metadata.width, height: metadata.height };
      if (!best || buffer.length < best.buffer.length) {
        best = candidate;
      }
      if (buffer.length <= maxBytes) {
        return candidate;
      }
    }
  }

  return best!;
}
