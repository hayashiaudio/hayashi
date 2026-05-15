import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const endpoint = process.env.AWS_ENDPOINT_URL_S3 ?? 'https://fly.storage.tigris.dev';
const region = process.env.AWS_REGION ?? 'auto';
const bucket = process.env.BUCKET_NAME ?? 'hayashi-assets';

export const s3 = new S3Client({
  endpoint,
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
  },
});

export async function uploadAsset(assetId: string, buffer: Buffer, contentType = 'application/octet-stream'): Promise<string> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: assetId,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return `${endpoint}/${bucket}/${assetId}`;
}

export async function getAssetUrl(assetId: string, expiresIn = 300): Promise<string> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: assetId });
  return getSignedUrl(s3, command, { expiresIn });
}

export function getPublicAssetUrl(assetId: string): string {
  return `${endpoint}/${bucket}/${assetId}`;
}
