import { createHash } from "node:crypto";
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
    profile_photo: {
        mimeTypes: ["image/jpeg", "image/png", "image/webp"],
        maxBytes: env.MAX_PROPERTY_IMAGE_SIZE_MB * 1024 * 1024,
    },
    legal_source_document: {
        mimeTypes: ["application/pdf", "text/plain"],
        maxBytes: env.MAX_TENANCY_EVIDENCE_SIZE_MB * 1024 * 1024,
    },
    verification_document: {
        mimeTypes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
        maxBytes: env.MAX_TENANCY_EVIDENCE_SIZE_MB * 1024 * 1024,
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

// How many leading bytes the content check needs.
export const CONTENT_SNIFF_BYTES = 512;

const startsWith = (buffer, bytes, offset = 0) =>
    buffer.length >= offset + bytes.length &&
    bytes.every((byte, index) => buffer[offset + index] === byte);
const ascii = (text) => [...text].map((char) => char.charCodeAt(0));

// True when a file's first bytes match the type the uploader declared, so a
// script or HTML page can't be stored and served as an "image" or "PDF".
export function contentMatchesMimeType(buffer, mimeType) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) return false;
    switch (mimeType) {
        case "image/jpeg":
            return startsWith(buffer, [0xff, 0xd8, 0xff]);
        case "image/png":
            return startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        case "image/webp":
            return startsWith(buffer, ascii("RIFF")) && startsWith(buffer, ascii("WEBP"), 8);
        case "application/pdf":
            // The PDF header may follow up to 1 KB of leading junk; we read
            // CONTENT_SNIFF_BYTES, which covers real-world files.
            return buffer.includes(Buffer.from("%PDF-"));
        case "video/mp4":
            return startsWith(buffer, ascii("ftyp"), 4);
        case "video/webm":
            return startsWith(buffer, [0x1a, 0x45, 0xdf, 0xa3]);
        case "text/plain":
            // Text has no NUL bytes; binaries almost always do.
            return !buffer.includes(0x00);
        default:
            return false;
    }
}

// The first `length` bytes of a stored object.
export async function readStoredObjectPrefix(storageKey, length = CONTENT_SNIFF_BYTES) {
    const { client, bucket } = requireR2();
    const response = await client.send(
        new GetObjectCommand({
            Bucket: bucket,
            Key: storageKey,
            Range: `bytes=0-${length - 1}`,
        })
    );
    return Buffer.from(await response.Body.transformToByteArray());
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

export async function readStoredObject(storageKey) {
    const { client, bucket } = requireR2();
    const response = await client.send(
        new GetObjectCommand({
            Bucket: bucket,
            Key: storageKey,
        })
    );

    return Buffer.from(await response.Body.transformToByteArray());
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
// Streams a stored object through SHA-256 without holding it in memory.
export async function hashStoredObject(storageKey) {
    const { client, bucket } = requireR2();
    const response = await client.send(
        new GetObjectCommand({
            Bucket: bucket,
            Key: storageKey,
        })
    );
    const hash = createHash("sha256");
    for await (const chunk of response.Body) {
        hash.update(chunk);
    }
    return hash.digest("hex");
}
