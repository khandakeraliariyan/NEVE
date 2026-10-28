import { S3Client } from "@aws-sdk/client-s3";
import { env } from "./env.js";

const r2Configured = [
    env.R2_ACCOUNT_ID,
    env.R2_ACCESS_KEY_ID,
    env.R2_SECRET_ACCESS_KEY,
    env.R2_BUCKET_NAME,
].every(Boolean);

export const isR2Configured = r2Configured;

export const r2Client = r2Configured
    ? new S3Client({
          region: env.R2_REGION,
          endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
          credentials: {
              accessKeyId: env.R2_ACCESS_KEY_ID,
              secretAccessKey: env.R2_SECRET_ACCESS_KEY,
          },
      })
    : null;

export const requireR2 = () => {
    if (!r2Client || !env.R2_BUCKET_NAME) {
        const error = new Error("File storage is not configured.");
        error.status = 503;
        throw error;
    }

    return {
        client: r2Client,
        bucket: env.R2_BUCKET_NAME,
    };
};