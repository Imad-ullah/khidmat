import { S3Client, type S3ClientConfig } from '@aws-sdk/client-s3';
import { env } from './env';

const s3Config: S3ClientConfig = {
  region: env.awsRegion,
};

if (env.awsAccessKeyId !== undefined && env.awsSecretAccessKey !== undefined) {
  s3Config.credentials = {
    accessKeyId: env.awsAccessKeyId,
    secretAccessKey: env.awsSecretAccessKey,
  };
}

export const s3Client = new S3Client(s3Config);
