import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";

import {
    backupId,
    decodeCollection,
    encodeCollection,
    pruneOldBackups,
    restoreBackup,
    runBackup,
} from "../src/server/services/backup.service.js";
import { runRetentionPurge } from "../src/server/services/retentionPurge.service.js";

function fakeFiles() {
    const calls = { locked: [], deleted: [], restored: [] };
    return {
        calls,
        findOneAndUpdate: async (filter) => {
            calls.locked.push(filter);
            return String(filter._id) === "changed" ? null : { _id: filter._id };
        },
        deleteOne: async (filter) => calls.deleted.push(String(filter._id)),
        updateOne: async (filter, update) => calls.restored.push([String(filter._id), update.$set.status]),
    };
}

const candidates = [
    { _id: "abandoned", storageKey: "k1", reason: "abandoned_upload" },
    { _id: "expired", storageKey: "k2", reason: "retention_ended" },
    { _id: "in-use", storageKey: "k3", reason: "retention_ended" },
    { _id: "changed", storageKey: "k4", reason: "verification_closed" },
];

test("purges unreferenced candidates and skips used or changed files", async () => {
    const Files = fakeFiles();
    const removed = [];
    const summary = await runRetentionPurge({
        deps: {
            findPurgeCandidates: async () => candidates,
            isFileReferenced: async (id) => id === "in-use",
            deleteStoredObject: async (key) => removed.push(key),
            UploadedFile: Files,
        },
    });
    assert.equal(summary.deleted, 2);
    assert.equal(summary.skippedReferenced, 1);
    assert.equal(summary.skippedChanged, 1);
    assert.deepEqual(removed, ["k1", "k2"]);
    assert.deepEqual(summary.byReason, { abandoned_upload: 1, retention_ended: 1 });
    assert.equal(Files.calls.locked[1].legalHold, false);
});

test("dry run deletes nothing", async () => {
    const Files = fakeFiles();
    const summary = await runRetentionPurge({
        dryRun: true,
        deps: {
            findPurgeCandidates: async () => candidates.slice(0, 2),
            isFileReferenced: async () => false,
            deleteStoredObject: async () => { throw new Error("must not delete"); },
            UploadedFile: Files,
        },
    });
    assert.equal(summary.deleted, 0);
    assert.deepEqual(summary.deletedFileIds, ["abandoned", "expired"]);
    assert.equal(Files.calls.locked.length, 0);
});

test("a storage failure unlocks the file", async () => {
    const Files = fakeFiles();
    const summary = await runRetentionPurge({
        deps: {
            findPurgeCandidates: async () => [candidates[1]],
            isFileReferenced: async () => false,
            deleteStoredObject: async () => { throw new Error("R2 down"); },
            UploadedFile: Files,
        },
    });
    assert.equal(summary.failed, 1);
    assert.deepEqual(Files.calls.restored, [["expired", "uploaded"]]);
});

test("collections round-trip through Extended JSON with types intact", () => {
    const id = new mongoose.Types.ObjectId();
    const date = new Date("2026-03-01T10:00:00Z");
    const encoded = encodeCollection([{ _id: id, at: date, n: 1 }]);
    assert.match(encoded.sha256, /^[a-f0-9]{64}$/);
    const [decoded] = decodeCollection(encoded.body);
    assert.ok(decoded._id.equals(id));
    assert.equal(decoded.at.toISOString(), date.toISOString());
    assert.deepEqual(decodeCollection(encodeCollection([]).body), []);
});

function fakeStorage() {
    const objects = new Map();
    const client = {
        send: async (command) => {
            const name = command.constructor.name;
            const input = command.input;
            if (name === "PutObjectCommand") {
                objects.set(input.Key, Buffer.from(input.Body));
                return {};
            }
            if (name === "GetObjectCommand") {
                const body = objects.get(input.Key);
                return { Body: { transformToByteArray: async () => body } };
            }
            if (name === "ListObjectsV2Command") {
                const keys = [...objects.keys()].filter((key) => key.startsWith(input.Prefix));
                if (input.Delimiter) {
                    const prefixes = [...new Set(keys.map((key) => input.Prefix + key.slice(input.Prefix.length).split("/")[0] + "/"))];
                    return { CommonPrefixes: prefixes.map((Prefix) => ({ Prefix })) };
                }
                return { Contents: keys.map((Key) => ({ Key })) };
            }
            if (name === "DeleteObjectsCommand") {
                for (const { Key } of input.Delete.Objects) objects.delete(Key);
                return {};
            }
            throw new Error(`Unexpected ${name}`);
        },
    };
    return { objects, storage: { client, bucket: "test-bucket" } };
}

function fakeDb(data) {
    return {
        databaseName: "neve-test",
        listCollections: () => ({ toArray: async () => Object.keys(data).map((name) => ({ name })) }),
        collection: (name) => ({
            find: () => ({ toArray: async () => data[name] ?? [] }),
            estimatedDocumentCount: async () => (data[name] ?? []).length,
            deleteMany: async () => { data[name] = []; },
            insertMany: async (docs) => { data[name] = [...(data[name] ?? []), ...docs]; },
        }),
    };
}

test("backs up every collection with a manifest, then restores it", async () => {
    const { objects, storage } = fakeStorage();
    const source = fakeDb({ users: [{ _id: 1, name: "A" }], properties: [{ _id: 2 }, { _id: 3 }], systemjoblocks: [{ _id: "backup" }] });
    const now = new Date("2026-05-01T00:00:00Z");
    const summary = await runBackup({ now, deps: { db: source, storage } });
    assert.equal(summary.collections, 2);
    assert.equal(summary.documents, 3);
    assert.ok(objects.has(`backups/${backupId(now)}/manifest.json`));

    const target = fakeDb({ users: [{ _id: 9 }] });
    const restored = await restoreBackup({ id: backupId(now), deps: { db: target, storage } });
    const byName = Object.fromEntries(restored.collections.map((c) => [c.name, c]));
    assert.equal(byName.users.skipped, true);
    assert.equal(byName.properties.restored, 2);
});

test("restore refuses a backup file that doesn't match its hash", async () => {
    const { objects, storage } = fakeStorage();
    const now = new Date("2026-05-02T00:00:00Z");
    await runBackup({ now, deps: { db: fakeDb({ users: [{ _id: 1 }] }), storage } });
    objects.set(`backups/${backupId(now)}/users.ejson.gz`, encodeCollection([{ _id: 666 }]).body);
    await assert.rejects(restoreBackup({ id: backupId(now), deps: { db: fakeDb({}), storage } }), /doesn't match/);
});

test("keeps only the newest backups", async () => {
    const { objects, storage } = fakeStorage();
    for (const day of [1, 2, 3]) {
        objects.set(`backups/2026-01-0${day}T00-00-00-000Z/manifest.json`, Buffer.from("{}"));
    }
    const pruned = await pruneOldBackups({ ...storage, keep: 2 });
    assert.deepEqual(pruned, ["2026-01-01T00-00-00-000Z"]);
    assert.equal(objects.size, 2);
});
