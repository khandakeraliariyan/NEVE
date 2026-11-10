import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";
import mongoose from "mongoose";
import sharp from "sharp";

import {
    appealListingWarning,
    decideListingAppeal,
    validateAppeal,
    validateAppealDecision,
} from "../src/controllers/listingAppeal.controller.js";
import AdminAuditLog from "../src/models/AdminAuditLog.js";
import ListingWarning from "../src/models/ListingWarning.js";
import Notification from "../src/models/Notification.js";
import Property from "../src/models/Property.js";
import User from "../src/models/User.js";
import {
    checkDuplicatePhotos,
    findDuplicatePhotos,
    hashListingPhoto,
} from "../src/services/duplicatePhoto.service.js";
import {
    DUPLICATE_DISTANCE,
    computePerceptualHash,
    hammingDistance,
} from "../src/services/imageHash.service.js";

afterEach(() => mock.restoreAll());

const id = () => new mongoose.Types.ObjectId();
const lean = (value) => ({ lean: async () => value });

function response() {
    return {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
        set() { return this; },
    };
}

async function run(handler, req) {
    const res = response();
    await handler(req, res, (error) => { throw error; });
    return res;
}

// --- Perceptual hash ------------------------------------------------------------

function scene(background, circleX, barX) {
    return Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">` +
        `<rect width="800" height="600" fill="${background}"/>` +
        `<circle cx="${circleX}" cy="300" r="150" fill="#335"/>` +
        `<rect x="${barX}" y="50" width="200" height="500" fill="#eee"/>` +
        `<polygon points="0,600 400,350 800,600" fill="#7a5"/></svg>`
    );
}

test("the same photo resized, recompressed or lightly cropped hashes alike; a different one doesn't", async () => {
    const room = await sharp(scene("#c9b", 250, 520)).jpeg({ quality: 90 }).toBuffer();
    const original = await computePerceptualHash(room);
    assert.match(original, /^[0-9a-f]{16}$/);

    const copies = [
        await sharp(room).resize(320).jpeg({ quality: 40 }).toBuffer(),
        await sharp(room).webp({ quality: 50 }).modulate({ brightness: 1.1 }).toBuffer(),
        await sharp(room).extract({ left: 20, top: 15, width: 760, height: 570 }).png().toBuffer(),
    ];
    for (const copy of copies) {
        assert.ok(hammingDistance(original, await computePerceptualHash(copy)) <= DUPLICATE_DISTANCE);
    }

    const other = await sharp(scene("#468", 600, 60)).jpeg().toBuffer();
    assert.ok(hammingDistance(original, await computePerceptualHash(other)) > DUPLICATE_DISTANCE);
});

test("hamming distance counts differing bits and rejects bad input", () => {
    assert.equal(hammingDistance("0000000000000000", "0000000000000000"), 0);
    assert.equal(hammingDistance("0000000000000000", "000000000000000f"), 4);
    assert.equal(hammingDistance("ffffffffffffffff", "0000000000000000"), 64);
    assert.equal(hammingDistance("abc", "0000000000000000"), Infinity);
    assert.equal(hammingDistance(null, "0000000000000000"), Infinity);
});

test("a photo that can't be decoded just has no hash", async () => {
    const file = { storageKey: "k" };
    const hash = await hashListingPhoto(file, {
        readStoredObject: async () => Buffer.from("not an image"),
    });
    assert.equal(hash, null);
    assert.equal(file.perceptualHash, undefined);
});

// --- Matching -------------------------------------------------------------------

function filesModel({ own, others }) {
    let call = 0;
    return { find: () => ({ select: () => lean(call++ === 0 ? own : others) }) };
}

test("only matches on another landlord's live listing count", async () => {
    const landlord = id();
    const ownPhoto = { _id: id(), perceptualHash: "ffff0000ffff0000" };
    const nearCopy = { _id: id(), perceptualHash: "ffff0000ffff0003" };
    const unrelated = { _id: id(), perceptualHash: "0000ffff0000ffff" };
    const otherListing = { _id: id(), landlord: id(), images: [nearCopy._id] };
    let listingFilter;
    const matches = await findDuplicatePhotos(
        { _id: id(), landlord, images: [ownPhoto._id] },
        {
            UploadedFileModel: filesModel({ own: [ownPhoto], others: [nearCopy, unrelated] }),
            PropertyModel: {
                find: (filter) => {
                    listingFilter = filter;
                    return { select: () => lean([otherListing]) };
                },
            },
        }
    );
    assert.equal(matches.length, 1);
    assert.equal(matches[0].distance, 2);
    assert.equal(String(matches[0].otherProperty), String(otherListing._id));
    // The landlord's own other listings don't count.
    assert.deepEqual(listingFilter.landlord, { $ne: landlord });
});

test("a new duplicate-photo warning alerts admins once; refreshing it doesn't", async () => {
    const property = { _id: id(), landlord: id(), title: "Flat", images: [id()] };
    const deps = (updatedExisting) => {
        const alerts = [];
        return {
            alerts,
            UploadedFileModel: filesModel({
                own: [{ _id: property.images[0], perceptualHash: "ffff0000ffff0000" }],
                others: [{ _id: id(), perceptualHash: "ffff0000ffff0000" }],
            }),
            PropertyModel: { find: () => ({ select: () => lean([{ _id: id(), landlord: id(), images: [] }]) }) },
            ListingWarningModel: { findOneAndUpdate: async () => ({ value: { _id: id() }, lastErrorObject: { updatedExisting } }) },
            notifyListingFlagged: async (input) => alerts.push(input),
        };
    };
    // The other listing has no matching image in this setup, so nothing is flagged.
    const none = deps(false);
    assert.equal(await checkDuplicatePhotos(property, none), null);

    const photo = { _id: id(), perceptualHash: "ffff0000ffff0000" };
    const flagged = deps(false);
    flagged.UploadedFileModel = filesModel({ own: [{ _id: property.images[0], perceptualHash: "ffff0000ffff0000" }], others: [photo] });
    flagged.PropertyModel = { find: () => ({ select: () => lean([{ _id: id(), landlord: id(), images: [photo._id] }]) }) };
    assert.ok(await checkDuplicatePhotos(property, flagged));
    assert.equal(flagged.alerts.length, 1);

    const refreshed = { ...flagged, alerts: [], ListingWarningModel: { findOneAndUpdate: async () => ({ value: { _id: id() }, lastErrorObject: { updatedExisting: true } }) } };
    refreshed.UploadedFileModel = filesModel({ own: [{ _id: property.images[0], perceptualHash: "ffff0000ffff0000" }], others: [photo] });
    refreshed.notifyListingFlagged = async (input) => refreshed.alerts.push(input);
    await checkDuplicatePhotos(property, refreshed);
    assert.equal(refreshed.alerts.length, 0);
});

// --- Appeals --------------------------------------------------------------------

test("appeals and decisions are validated", () => {
    assert.ok(validateAppeal({ text: "These are my own photos, taken in 2024." }).value);
    assert.ok(validateAppeal({ text: "short" }).error);
    assert.ok(validateAppeal({ text: "These are my own photos.", evidenceFileIds: ["nope"] }).error);
    assert.ok(validateAppealDecision({ decision: "accepted" }).value);
    assert.ok(validateAppealDecision({ decision: "rejected" }).error);
    assert.ok(validateAppealDecision({ decision: "rejected", note: "The same photos appear on an older listing." }).value);
    assert.ok(validateAppealDecision({ decision: "maybe" }).error);
});

function appealRequest(landlord, warningId, body = {}) {
    return {
        params: { warningId: String(warningId) },
        body: { text: "These are my own photos, taken when I bought the flat.", ...body },
        neveUser: { _id: landlord, role: "landlord" },
    };
}

test("a landlord appeals a warning on their listing and admins are told", async () => {
    const landlord = id();
    const warning = { _id: id(), property: id(), type: "duplicate_photo", status: "open", appeal: { status: "none" } };
    mock.method(ListingWarning, "findById", async () => warning);
    mock.method(Property, "findOne", () => ({ select: () => lean({ _id: warning.property, title: "Flat", landlord }) }));
    const update = mock.method(ListingWarning, "findOneAndUpdate", async (filter, change) => ({ ...warning, appeal: { status: "pending" } }));
    const admin = id();
    mock.method(User, "find", () => ({ distinct: async () => [admin] }));
    const created = mock.method(Notification, "create", async (doc) => doc);

    const res = await run(appealListingWarning, appealRequest(landlord, warning._id));

    assert.equal(res.statusCode, 201);
    const set = update.mock.calls[0].arguments[1].$set;
    assert.equal(set["appeal.status"], "pending");
    assert.match(set["appeal.text"], /my own photos/);
    const doc = created.mock.calls[0].arguments[0];
    assert.equal(doc.type, "listing_appeal_submitted");
    assert.equal(String(doc.recipient), String(admin));
});

test("another landlord's warning can't be appealed, and a pending appeal can't be repeated", async () => {
    const warning = { _id: id(), property: id(), status: "open", appeal: { status: "pending" } };
    mock.method(ListingWarning, "findById", async () => warning);

    mock.method(Property, "findOne", () => ({ select: () => lean(null) }));
    assert.equal((await run(appealListingWarning, appealRequest(id(), warning._id))).statusCode, 404);

    mock.restoreAll();
    mock.method(ListingWarning, "findById", async () => warning);
    mock.method(Property, "findOne", () => ({ select: () => lean({ _id: warning.property, title: "Flat" }) }));
    assert.equal((await run(appealListingWarning, appealRequest(id(), warning._id))).statusCode, 409);

    mock.restoreAll();
    mock.method(ListingWarning, "findById", async () => ({ ...warning, status: "dismissed", appeal: { status: "none" } }));
    mock.method(Property, "findOne", () => ({ select: () => lean({ _id: warning.property, title: "Flat" }) }));
    assert.equal((await run(appealListingWarning, appealRequest(id(), warning._id))).statusCode, 409);
});

test("an accepted appeal dismisses the warning and tells the landlord", async () => {
    const landlord = id();
    const warning = { _id: id(), property: id(), type: "duplicate_photo", status: "dismissed" };
    const update = mock.method(ListingWarning, "findOneAndUpdate", async () => warning);
    mock.method(AdminAuditLog, "findOne", () => ({ sort: () => ({ select: () => lean(null) }) }));
    mock.method(AdminAuditLog, "create", async (doc) => doc);
    mock.method(Property, "findById", () => ({ select: () => lean({ _id: warning.property, title: "Flat", landlord }) }));
    const created = mock.method(Notification, "create", async (doc) => doc);

    const res = await run(decideListingAppeal, {
        params: { warningId: String(warning._id) },
        body: { decision: "accepted", note: "The deed shows you own both flats." },
        neveUser: { _id: id(), role: "admin" },
    });

    assert.equal(res.statusCode, 200);
    const [filter, change] = update.mock.calls[0].arguments;
    assert.equal(filter["appeal.status"], "pending");
    assert.equal(change.$set.status, "dismissed");
    assert.equal(change.$set.publiclyVisible, false);
    const doc = created.mock.calls[0].arguments[0];
    assert.equal(doc.type, "listing_appeal_decided");
    assert.equal(String(doc.recipient), String(landlord));
    assert.match(doc.title, /Appeal accepted/);
});

test("a rejected appeal keeps the warning as reviewed", async () => {
    const update = mock.method(ListingWarning, "findOneAndUpdate", async () => ({ _id: id(), property: id(), type: "unusual_rent" }));
    mock.method(AdminAuditLog, "findOne", () => ({ sort: () => ({ select: () => lean(null) }) }));
    mock.method(AdminAuditLog, "create", async (doc) => doc);
    mock.method(Property, "findById", () => ({ select: () => lean(null) }));
    const res = await run(decideListingAppeal, {
        params: { warningId: String(id()) },
        body: { decision: "rejected", note: "Rent is still far above similar flats in the area." },
        neveUser: { _id: id(), role: "admin" },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(update.mock.calls[0].arguments[1].$set.status, "reviewed");
});
