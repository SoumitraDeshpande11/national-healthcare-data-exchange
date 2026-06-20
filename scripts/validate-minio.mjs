#!/usr/bin/env node
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";

const endpoint = process.env.MINIO_ENDPOINT ?? "http://localhost:9000";
const accessKeyId = process.env.MINIO_ACCESS_KEY ?? "minioadmin";
const secretAccessKey = process.env.MINIO_SECRET_KEY ?? "minioadmin";
const bucket = process.env.MINIO_BUCKET ?? "healthcare-documents";
const key = `integration-check/${Date.now()}-${process.pid}.json`;
const payload = JSON.stringify({
  integration: "minio",
  checkedAt: new Date().toISOString()
});

const client = new S3Client({
  endpoint,
  region: process.env.AWS_REGION ?? "us-east-1",
  forcePathStyle: true,
  credentials: {
    accessKeyId,
    secretAccessKey
  }
});

async function ensureBucket() {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return;
  } catch (error) {
    const statusCode = error?.$metadata?.httpStatusCode;
    const notFound = statusCode === 404 || error?.name === "NotFound" || error?.name === "NoSuchBucket";
    if (!notFound) {
      throw error;
    }
  }

  await client.send(new CreateBucketCommand({ Bucket: bucket }));
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForBucket() {
  let lastError;

  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      await ensureBucket();
      return;
    } catch (error) {
      const statusCode = error?.$metadata?.httpStatusCode;
      if (statusCode === 401 || statusCode === 403) {
        throw error;
      }

      lastError = error;
      await sleep(2000);
    }
  }

  throw lastError;
}

async function bodyToString(body) {
  if (!body) {
    return "";
  }

  if (typeof body.transformToString === "function") {
    return body.transformToString();
  }

  const chunks = [];
  for await (const chunk of body) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

try {
  await waitForBucket();
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: payload,
    ContentType: "application/json"
  }));

  const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const actual = await bodyToString(object.Body);
  if (actual !== payload) {
    throw new Error("MinIO object readback did not match the uploaded payload");
  }

  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  console.log(`MinIO validation passed: wrote, read, and deleted s3://${bucket}/${key}`);
} catch (error) {
  console.error(`MinIO validation failed against ${endpoint}: ${error.message}`);
  process.exit(1);
}
