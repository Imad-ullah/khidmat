import { PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env';
import { s3Client } from '../config/s3';
import { AppError } from './appError';

export type UploadFileInput = {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
  folder: string;
  isPrivate: boolean;
};

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

export const uploadFileToS3 = async (input: UploadFileInput): Promise<string> => {
  if (!allowedMimeTypes.has(input.mimeType)) {
    throw new AppError('Unsupported file type', 422, 'UNSUPPORTED_FILE_TYPE');
  }

  if (input.buffer.byteLength > 5 * 1024 * 1024) {
    throw new AppError('File exceeds 5MB limit', 422, 'FILE_TOO_LARGE');
  }

  const bucket = input.isPrivate ? process.env.AWS_S3_PRIVATE_BUCKET ?? process.env.AWS_S3_BUCKET_NAME : process.env.AWS_S3_PUBLIC_BUCKET ?? process.env.AWS_S3_BUCKET_NAME;

  if (bucket === undefined || bucket.trim() === '') {
    throw new AppError('S3 bucket is not configured', 500, 'S3_NOT_CONFIGURED');
  }

  const extension = input.originalName.includes('.') ? input.originalName.split('.').pop() : 'bin';
  const key = `${input.folder}/${randomUUID()}.${extension}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: input.buffer,
      ContentType: input.mimeType,
      ServerSideEncryption: input.isPrivate ? 'AES256' : undefined,
    }),
  );

  return `s3://${bucket}/${key}`;
};
