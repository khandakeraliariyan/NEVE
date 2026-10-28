import {
    PutObjectCommand,
    HeadObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
} from "@aws-sdk/client-s3";

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Client, R2_BUCKET } from "../config/r2.js";

const uploadLimits = {
    property_image: {
        mimeTypes: ["image/jpeg", "image/png", "image/webp"],
        maxBytes: 5 * 1024 * 1024, // 5 MB
    },
    tenancy_evidence: {
        mimeTypes: ["application/pdf"],
        maxBytes: 15 * 1024 * 1024, // 15 MB
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
    const command = new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: storageKey,
        ContentType: mimeType,
        ContentLength: sizeBytes,
    });

    return getSignedUrl(r2Client, command, {
        expiresIn: Number(process.env.UPLOAD_URL_TTL_SECONDS || 300),
    });
}

export async function getStoredObjectMetadata(storageKey) {
    return r2Client.send(
        new HeadObjectCommand({
            Bucket: R2_BUCKET,
            Key: storageKey,
        })
    );
}

export async function createDownloadUrl(storageKey) {
    const command = new GetObjectCommand({
        Bucket: R2_BUCKET,
        Key: storageKey,
    });

    return getSignedUrl(r2Client, command, {
        expiresIn: 300,
    });
}

export async function deleteStoredObject(storageKey) {
    return r2Client.send(
        new DeleteObjectCommand({
            Bucket: R2_BUCKET,
            Key: storageKey,
        })
    );
}