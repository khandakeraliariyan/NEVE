import {
    PutObjectCommand,
    HeadObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
} from "@aws-sdk/client-s3";

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { requireR2 } from "../config/r2.js";
import { env } from "../config/env.js";

const uploadLimits = {
    property_image: {
        mimeTypes: ["image/jpeg", "image/png", "image/webp"],
        maxBytes: env.MAX_PROPERTY_IMAGE_SIZE_MB * 1024 * 1024,
    },
    property_video: {
        mimeTypes: ["video/mp4", "video/webm"],
        maxBytes: env.MAX_PROPERTY_VIDEO_SIZE_MB * 1024 * 1024,
    },
    floor_plan: {
        mimeTypes: [
            "image/jpeg",
            "image/png",
            "image/webp",
            "application/pdf",
        ],
        maxBytes: env.MAX_FLOOR_PLAN_SIZE_MB * 1024 * 1024,
    },
    tenancy_evidence: {
        mimeTypes: [
            "application/pdf",
            "image/jpeg",
            "image/png",
            "image/webp",
            "text/plain",
        ],
        maxBytes: env.MAX_TENANCY_EVIDENCE_SIZE_MB * 1024 * 1024,
    },
};

export function validateUpload({ purpose, mimeType, sizeBytes }) {
    const policy = uploadLimits[purpose];

    if (!policy) {
        throw new Error("Invalid upload purpose.");
    }

    if (!policy.mimeTypes.includes(mimeType)) {
        throw new Error("File type is not allowed for this purpose.");
    }

    if (
        !Number.isSafeInteger(sizeBytes) ||
        sizeBytes < 1 ||
        sizeBytes > policy.maxBytes
    ) {
        throw new Error(
            `File size must be between 1 byte and ${policy.maxBytes} bytes.`
        );
    }
}

export async function createUploadUrl({
    storageKey,
    mimeType,
    sizeBytes,
}) {
    const { client, bucket } = requireR2();
    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        ContentType: mimeType,
        ContentLength: sizeBytes,
    });

    return getSignedUrl(client, command, {
        expiresIn: env.UPLOAD_URL_TTL_SECONDS,
    });
}

export async function getStoredObjectMetadata(storageKey) {
    const { client, bucket } = requireR2();
    return client.send(
        new HeadObjectCommand({
            Bucket: bucket,
            Key: storageKey,
        })
    );
}

export async function createDownloadUrl(storageKey) {
    const { client, bucket } = requireR2();
    const command = new GetObjectCommand({
        Bucket: bucket,
        Key: storageKey,
    });

    return getSignedUrl(client, command, {
        expiresIn: 300,
    });
}

export async function deleteStoredObject(storageKey) {
    const { client, bucket } = requireR2();
    return client.send(
        new DeleteObjectCommand({
            Bucket: bucket,
            Key: storageKey,
        })
    );
}