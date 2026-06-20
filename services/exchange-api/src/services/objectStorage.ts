import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

const endpoint = new URL(env.MINIO_ENDPOINT);

export const s3 = new S3Client({
  endpoint: env.MINIO_ENDPOINT,
  region: "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId: env.MINIO_ACCESS_KEY,
    secretAccessKey: env.MINIO_SECRET_KEY
  }
});

export async function ensureDocumentBucket() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: env.MINIO_BUCKET }));
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: env.MINIO_BUCKET }));
    logger.info({ bucket: env.MINIO_BUCKET }, "created MinIO document bucket");
  }
}

export function buildDocumentObjectKey(patientId: string, fileName: string) {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return `patients/${patientId}/documents/${randomUUID()}-${safeName}`;
}

export async function putDocumentObject({
  objectKey,
  body,
  contentType,
  checksum
}: {
  objectKey: string;
  body: Buffer;
  contentType: string;
  checksum: string;
}) {
  await s3.send(
    new PutObjectCommand({
      Bucket: env.MINIO_BUCKET,
      Key: objectKey,
      Body: body,
      ContentType: contentType,
      Metadata: {
        checksum_sha256: checksum
      }
    })
  );
}

export async function getDocumentObject(objectKey: string) {
  const result = await s3.send(
    new GetObjectCommand({
      Bucket: env.MINIO_BUCKET,
      Key: objectKey
    })
  );

  return {
    body: result.Body as Readable,
    contentType: result.ContentType ?? "application/octet-stream"
  };
}

export function publicMinioConsoleUrl() {
  return `${endpoint.protocol}//localhost:9001`;
}
