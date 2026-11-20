import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import {
    DeleteObjectsCommand,
    GetObjectCommand,
    ListObjectsV2Command,
    PutObjectCommand,
} from "@aws-sdk/client-s3";
import mongoose from "mongoose";

import { env } from "../config/env.js";
import { currentPolicyValues } from "./platformSettings.service.js";
import { requireR2 } from "../config/r2.js";

// Database backups to private object storage. Each backup is a folder
// backups/<id>/ holding one gzipped Extended JSON file per collection and a
// manifest.json with document counts and SHA-256 hashes. Stored files (photos,
// documents) are already in object storage and are not copied.

const { EJSON } = mongoose.mongo.BSON;
const PREFIX = "backups/";
const EXCLUDED_COLLECTIONS = new Set(["systemjoblocks"]);

export function backupBucket() {
    const { client, bucket } = requireR2();
    return { client, bucket: env.BACKUP_BUCKET_NAME || bucket };
}

export function backupId(date = new Date()) {
    return date.toISOString().replace(/[:.]/g, "-");
}

export function encodeCollection(documents) {
    const lines = documents.map((document) => EJSON.stringify(document, { relaxed: false }));
    const body = gzipSync(Buffer.from(lines.join("\n"), "utf8"));
    return { body, sha256: createHash("sha256").update(body).digest("hex"), count: documents.length };
}

export function decodeCollection(body) {
    const text = gunzipSync(body).toString("utf8");
    return text ? text.split("\n").map((line) => EJSON.parse(line, { relaxed: false })) : [];
}

async function collectionNames(db) {
    const collections = await db.listCollections({}, { nameOnly: true }).toArray();
    return collections
        .map((collection) => collection.name)
        .filter((name) => !name.startsWith("system.") && !EXCLUDED_COLLECTIONS.has(name))
        .sort();
}

export async function runBackup({ now = new Date(), deps = {} } = {}) {
    const db = deps.db ?? mongoose.connection.db;
    if (!db) {
        throw new Error("Database is not connected.");
    }
    const { client, bucket } = deps.storage ?? backupBucket();
    const id = backupId(now);
    const manifest = {
        format: "neve.database-backup",
        version: 1,
        id,
        createdAt: now.toISOString(),
        database: db.databaseName,
        collections: [],
    };

    for (const name of await collectionNames(db)) {
        const documents = await db.collection(name).find({}).toArray();
        const encoded = encodeCollection(documents);
        const key = `${PREFIX}${id}/${name}.ejson.gz`;
        await client.send(
            new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                Body: encoded.body,
                ContentType: "application/gzip",
                ContentLength: encoded.body.length,
            })
        );
        manifest.collections.push({ name, key, count: encoded.count, sizeBytes: encoded.body.length, sha256: encoded.sha256 });
    }

    const manifestBody = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
    await client.send(
        new PutObjectCommand({
            Bucket: bucket,
            Key: `${PREFIX}${id}/manifest.json`,
            Body: manifestBody,
            ContentType: "application/json",
            ContentLength: manifestBody.length,
        })
    );

    const pruned = await pruneOldBackups({ client, bucket, keep: (await currentPolicyValues()).backupRetentionCount });

    return {
        backupId: id,
        bucket,
        collections: manifest.collections.length,
        documents: manifest.collections.reduce((sum, collection) => sum + collection.count, 0),
        sizeBytes: manifest.collections.reduce((sum, collection) => sum + collection.sizeBytes, 0),
        prunedBackups: pruned,
    };
}

export async function listBackupIds({ client, bucket }) {
    const ids = [];
    let token;
    do {
        const page = await client.send(
            new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIX, Delimiter: "/", ContinuationToken: token })
        );
        for (const prefix of page.CommonPrefixes ?? []) {
            ids.push(prefix.Prefix.slice(PREFIX.length, -1));
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return ids.sort();
}

// Keeps the newest `keep` backups (IDs sort by time) and deletes the rest.
export async function pruneOldBackups({ client, bucket, keep }) {
    const ids = await listBackupIds({ client, bucket });
    const stale = ids.slice(0, Math.max(0, ids.length - keep));
    for (const id of stale) {
        let token;
        do {
            const page = await client.send(
                new ListObjectsV2Command({ Bucket: bucket, Prefix: `${PREFIX}${id}/`, ContinuationToken: token })
            );
            const objects = (page.Contents ?? []).map((object) => ({ Key: object.Key }));
            if (objects.length) {
                await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects } }));
            }
            token = page.IsTruncated ? page.NextContinuationToken : undefined;
        } while (token);
    }
    return stale;
}

async function readObject(client, bucket, key) {
    const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return Buffer.from(await response.Body.transformToByteArray());
}

// Restores a backup into the connected database. Collections that already
// contain documents are skipped unless drop is true. Every file's SHA-256 is
// checked against the manifest before anything is written.
export async function restoreBackup({ id, drop = false, deps = {} }) {
    const db = deps.db ?? mongoose.connection.db;
    const { client, bucket } = deps.storage ?? backupBucket();
    const manifest = JSON.parse((await readObject(client, bucket, `${PREFIX}${id}/manifest.json`)).toString("utf8"));

    const loaded = [];
    for (const collection of manifest.collections) {
        const body = await readObject(client, bucket, collection.key);
        const sha256 = createHash("sha256").update(body).digest("hex");
        if (sha256 !== collection.sha256) {
            throw new Error(`Backup file ${collection.key} doesn't match its manifest hash.`);
        }
        loaded.push({ name: collection.name, documents: decodeCollection(body) });
    }

    const results = [];
    for (const { name, documents } of loaded) {
        const target = db.collection(name);
        const existing = await target.estimatedDocumentCount();
        if (existing > 0 && !drop) {
            results.push({ name, restored: 0, skipped: true, reason: "Collection is not empty." });
            continue;
        }
        if (existing > 0) {
            await target.deleteMany({});
        }
        if (documents.length) {
            await target.insertMany(documents, { ordered: false });
        }
        results.push({ name, restored: documents.length, skipped: false });
    }
    return { backupId: id, collections: results };
}
