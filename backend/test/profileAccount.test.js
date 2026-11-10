import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test, { afterEach, mock } from "node:test";
import mongoose from "mongoose";

import { env } from "../src/config/env.js";
import {
    adminReviewVerificationRequest,
    submitVerificationRequest,
} from "../src/controllers/verification.controller.js";
import { allowRoles } from "../src/middleware/role.middleware.js";
import Inquiry from "../src/models/Inquiry.js";
import Notification from "../src/models/Notification.js";
import NotificationDelivery from "../src/models/NotificationDelivery.js";
import Property from "../src/models/Property.js";
import RenterPreference from "../src/models/RenterPreference.js";
import SavedProperty from "../src/models/SavedProperty.js";
import SavedSearch from "../src/models/SavedSearch.js";
import CopilotConversation from "../src/models/CopilotConversation.js";
import UploadedFile from "../src/models/UploadedFile.js";
import User from "../src/models/User.js";
import UserSession from "../src/models/UserSession.js";
import VerificationRequest from "../src/models/VerificationRequest.js";
import ViewingRequest from "../src/models/ViewingRequest.js";
import { deleteAccount } from "../src/services/accountDeletion.service.js";
import {
    decryptField,
    encryptField,
    identityAad,
    maskIdNumber,
} from "../src/services/fieldEncryption.service.js";
import {
    buildPublicProfile,
    responseRate,
    validateProfileFields,
} from "../src/services/profile.service.js";
import { syncGooglePhoto } from "../src/services/securityAlerts.service.js";
import {
    isSessionRevoked,
    revokeOtherSessions,
    revokeSession,
    shortenIp,
} from "../src/services/sessions.service.js";
import {
    normalizeDateOfBirth,
    normalizeIdNumber,
} from "../src/services/verification.service.js";

const id = () => new mongoose.Types.ObjectId();
const originalKey = env.FIELD_ENCRYPTION_KEY;
const originalOldKeys = env.FIELD_ENCRYPTION_OLD_KEYS;
const originalVersion = env.FIELD_ENCRYPTION_KEY_VERSION;
const testKey = randomBytes(32).toString("base64");

afterEach(() => {
    mock.restoreAll();
    env.FIELD_ENCRYPTION_KEY = originalKey;
    env.FIELD_ENCRYPTION_OLD_KEYS = originalOldKeys;
    env.FIELD_ENCRYPTION_KEY_VERSION = originalVersion;
});

function response() {
    return {
        statusCode: 200,
        headers: {},
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
        set(name, value) { this.headers[name] = value; return this; },
    };
}

async function run(handler, req) {
    const res = response();
    await handler(req, res, (error) => { throw error; });
    return res;
}

const lean = (value) => ({ lean: async () => value });

// --- ID numbers and dates of birth --------------------------------------------

test("NID and passport numbers are checked and normalised", () => {
    assert.equal(normalizeIdNumber("national_id", "1234 567 890"), "1234567890");
    assert.equal(normalizeIdNumber("national_id", "1234567890123"), "1234567890123");
    assert.equal(normalizeIdNumber("national_id", "12345678901234567"), "12345678901234567");
    assert.equal(normalizeIdNumber("national_id", "12345678901"), null);
    assert.equal(normalizeIdNumber("national_id", "12345abcde"), null);
    assert.equal(normalizeIdNumber("passport", "eb1234567"), "EB1234567");
    assert.equal(normalizeIdNumber("passport", "EB12"), null);
});

test("date of birth must be real and 18 or older", () => {
    const now = new Date("2026-11-08");
    assert.equal(normalizeDateOfBirth("1990-05-17", now), "1990-05-17");
    assert.equal(normalizeDateOfBirth("2010-01-01", now), null);
    assert.equal(normalizeDateOfBirth("1990-02-30", now), null);
    assert.equal(normalizeDateOfBirth("17/05/1990", now), null);
});

test("encrypted fields round-trip and are bound to their owner and field", () => {
    env.FIELD_ENCRYPTION_KEY = testKey;
    const owner = id();
    const value = encryptField("1234567890", identityAad(owner, "idNumber"));
    assert.ok(!JSON.stringify(value).includes("1234567890"));
    assert.equal(decryptField(value, identityAad(owner, "idNumber")), "1234567890");
    // Copied to another user or field: refused.
    assert.throws(() => decryptField(value, identityAad(id(), "idNumber")));
    assert.throws(() => decryptField(value, identityAad(owner, "dateOfBirth")));
    // Tampered: refused.
    const bytes = Buffer.from(value.cipherText, "base64");
    bytes[0] ^= 1;
    assert.throws(() => decryptField({ ...value, cipherText: bytes.toString("base64") }, identityAad(owner, "idNumber")));
    assert.equal(maskIdNumber("4821"), "•••• •••• 4821");
});

test("values written with an old key still decrypt after rotation", () => {
    env.FIELD_ENCRYPTION_KEY = testKey;
    const owner = id();
    const old = encryptField("EB1234567", identityAad(owner, "idNumber"));
    env.FIELD_ENCRYPTION_OLD_KEYS = `1:${testKey}`;
    env.FIELD_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    env.FIELD_ENCRYPTION_KEY_VERSION = 2;
    assert.equal(decryptField(old, identityAad(owner, "idNumber")), "EB1234567");
    assert.equal(encryptField("x", "aad").keyVersion, 2);
});

// --- Verification requests -------------------------------------------------------

function identityRequest(user, body = {}) {
    return {
        neveUser: user,
        body: {
            type: "identity",
            documentType: "national_id",
            documents: [String(id())],
            idNumber: "1990 1234 5678 4821 0",
            dateOfBirth: "1990-05-17",
            ...body,
        },
    };
}

function renter() {
    return {
        _id: id(),
        role: "renter",
        verification: { identity: { status: "unverified" } },
        set: mock.fn(),
        save: mock.fn(async () => {}),
    };
}

test("identity requests store the number and date of birth encrypted and answer masked", async () => {
    env.FIELD_ENCRYPTION_KEY = testKey;
    const user = renter();
    mock.method(UploadedFile, "countDocuments", async () => 1);
    const create = mock.method(VerificationRequest, "create", async (doc) => ({ toObject: () => ({ _id: id(), ...doc }) }));

    const res = await run(submitVerificationRequest, identityRequest(user, { idNumber: "19901234567848210" }));

    assert.equal(res.statusCode, 201);
    const stored = create.mock.calls[0].arguments[0];
    assert.equal(stored.identityDetails.idLast4, "8210");
    assert.ok(!JSON.stringify(stored).includes("19901234567848210"));
    assert.ok(!JSON.stringify(stored).includes("1990-05-17"));
    assert.equal(decryptField(stored.identityDetails.idNumber, identityAad(user._id, "idNumber")), "19901234567848210");
    assert.equal(decryptField(stored.identityDetails.dateOfBirth, identityAad(user._id, "dateOfBirth")), "1990-05-17");
    assert.deepEqual(res.body.data.identityDetails, { maskedNumber: "•••• •••• 8210", dateOfBirthProvided: true });
    assert.deepEqual(user.set.mock.calls[0].arguments, ["verification.identity.status", "pending"]);
});

test("identity requests are refused when encryption isn't configured", async () => {
    env.FIELD_ENCRYPTION_KEY = undefined;
    const res = await run(submitVerificationRequest, identityRequest(renter(), { idNumber: "1234567890" }));
    assert.equal(res.statusCode, 503);
});

test("only legal reviewers verify credentials, and they need an enrolment number first", async () => {
    const renterRes = await run(submitVerificationRequest, {
        neveUser: renter(),
        body: { type: "credential", documentType: "bar_enrolment_certificate", documents: [String(id())] },
    });
    assert.equal(renterRes.statusCode, 403);

    const reviewer = { ...renter(), role: "legal_reviewer", verification: {}, profile: { reviewer: { barEnrolmentNumber: "" } } };
    const missing = await run(submitVerificationRequest, {
        neveUser: reviewer,
        body: { type: "credential", documentType: "bar_enrolment_certificate", documents: [String(id())] },
    });
    assert.equal(missing.statusCode, 400);

    reviewer.profile.reviewer = { barEnrolmentNumber: "BC/1234/2015", jurisdictions: ["Dhaka"] };
    mock.method(UploadedFile, "countDocuments", async () => 1);
    const create = mock.method(VerificationRequest, "create", async (doc) => ({ toObject: () => doc }));
    const ok = await run(submitVerificationRequest, {
        neveUser: reviewer,
        body: { type: "credential", documentType: "bar_enrolment_certificate", documents: [String(id())] },
    });
    assert.equal(ok.statusCode, 201);
    assert.deepEqual(create.mock.calls[0].arguments[0].credentialDetails, { barEnrolmentNumber: "BC/1234/2015", jurisdictions: ["Dhaka"] });
});

test("approving identity copies the encrypted number to the profile", async () => {
    env.FIELD_ENCRYPTION_KEY = testKey;
    const owner = id();
    const idNumber = encryptField("1234567890", identityAad(owner, "idNumber"));
    const dateOfBirth = encryptField("1990-05-17", identityAad(owner, "dateOfBirth"));
    const request = { _id: id(), user: owner, type: "identity", documentType: "national_id", property: null };
    mock.method(VerificationRequest, "findById", () => ({
        select: (fields) => (fields === "user"
            ? { user: owner }
            : lean({ documentType: "national_id", identityDetails: { idLast4: "7890", idNumber, dateOfBirth } })),
    }));
    mock.method(VerificationRequest, "findOneAndUpdate", async () => request);
    const userUpdate = mock.method(User, "updateOne", async () => ({ modifiedCount: 1 }));
    const { default: AdminAuditLog } = await import("../src/models/AdminAuditLog.js");
    mock.method(AdminAuditLog, "findOne", () => ({ sort: () => ({ select: () => lean(null) }) }));
    mock.method(AdminAuditLog, "create", async (doc) => doc);
    mock.method(Notification, "create", async (doc) => doc);

    const res = await run(adminReviewVerificationRequest, {
        params: { requestId: String(request._id) },
        body: { decision: "approved" },
        neveUser: { _id: id(), role: "admin" },
    });

    assert.equal(res.statusCode, 200);
    const set = userUpdate.mock.calls[0].arguments[1].$set;
    assert.equal(set["verification.identity.status"], "verified");
    assert.equal(set["identity.idLast4"], "7890");
    assert.deepEqual(set["identity.idNumber"], idNumber);
    assert.equal(decryptField(set["identity.dateOfBirth"], identityAad(owner, "dateOfBirth")), "1990-05-17");
});

// --- Profile fields and public profile ----------------------------------------

test("role-specific profile fields are validated per role", () => {
    const renterFields = validateProfileFields({
        bio: "Quiet professional",
        renterProfile: {
            occupation: "Engineer",
            householdSize: 3,
            emergencyContact: { name: "Karim", relationship: "Brother", phone: "+8801700000000" },
        },
        privacy: { showPhoto: false },
    }, "renter");
    assert.equal(renterFields.updates["profile.renter.householdSize"], 3);
    assert.equal(renterFields.updates["privacy.showPhoto"], false);
    assert.equal(renterFields.updates["profile.renter.emergencyContact"].name, "Karim");

    assert.ok(validateProfileFields({ landlordProfile: { contactHours: "9-5" } }, "renter").error);
    assert.ok(validateProfileFields({ renterProfile: { householdSize: 0 } }, "renter").error);
    assert.ok(validateProfileFields({ renterProfile: { emergencyContact: { name: "Karim" } } }, "renter").error);
    assert.ok(validateProfileFields({ renterProfile: { nid: "1" } }, "renter").error);
    assert.equal(
        validateProfileFields({ reviewerProfile: { barEnrolmentNumber: "BC/1234/2015", jurisdictions: ["Dhaka", "Dhaka"] } }, "legal_reviewer")
            .updates["profile.reviewer.jurisdictions"].length,
        1
    );
    assert.ok(validateProfileFields({ privacy: { showPhone: true } }, "renter").error);
});

test("the public profile shows dated badges and never private details", () => {
    const verifiedAt = new Date("2030-01-01");
    const user = {
        _id: id(),
        displayName: "Lamia",
        role: "landlord",
        photoURL: "https://example.com/p.jpg",
        createdAt: new Date("2029-01-01"),
        email: "lamia@example.com",
        phoneNumber: "+8801711111111",
        verification: {
            email: { verified: true, verifiedAt },
            phone: { verified: true, verifiedAt },
            identity: { status: "verified", verifiedAt },
        },
        profile: { bio: "Owner", landlord: { contactAddress: "House 1, Road 2", contactHours: "Weekdays 10-6" } },
        identity: { idLast4: "4821" },
        privacy: {},
    };
    const stats = { activeListings: 2, ownership: { count: 1, latestVerifiedAt: verifiedAt }, responseRate: 90, typicalResponseTime: "Usually replies within 3 hours" };
    const profile = buildPublicProfile(user, stats);
    assert.deepEqual(profile.badges.map((badge) => badge.type), ["email", "phone", "identity", "ownership"]);
    assert.ok(profile.badges.every((badge) => badge.verifiedAt));
    assert.equal(profile.landlord.responseRate, 90);
    assert.equal(profile.landlord.contactHours, "Weekdays 10-6");
    const json = JSON.stringify(profile);
    for (const secret of ["lamia@example.com", "+8801711111111", "House 1", "4821"]) {
        assert.ok(!json.includes(secret), `public profile must not include ${secret}`);
    }

    const hidden = buildPublicProfile({ ...user, privacy: { showPhoto: false, showBadges: false, showBio: false } }, stats);
    assert.equal(hidden.photoURL, null);
    assert.deepEqual(hidden.badges, []);
    assert.equal(hidden.bio, "");
});

test("response rate needs three inquiries", () => {
    assert.equal(responseRate([{}, {}]), null);
    assert.equal(responseRate([{ respondedAt: 1 }, { firstLandlordReplyAt: 1 }, {}, {}]), 50);
});

test("Google photo sync never replaces an uploaded photo", async () => {
    const updates = [];
    const UserModel = { updateOne: async (filter, update) => updates.push(update.$set) };
    await syncGooglePhoto({ _id: id(), photoSource: "google", photoSyncWithGoogle: true }, "https://lh3.googleusercontent.com/a", UserModel);
    assert.deepEqual(updates[0], { googlePhotoURL: "https://lh3.googleusercontent.com/a", photoURL: "https://lh3.googleusercontent.com/a", photoSource: "google" });
    await syncGooglePhoto({ _id: id(), photoSource: "upload", photoSyncWithGoogle: true, profilePhoto: id() }, "https://lh3.googleusercontent.com/b", UserModel);
    assert.deepEqual(updates[1], { googlePhotoURL: "https://lh3.googleusercontent.com/b" });
    await syncGooglePhoto({ _id: id(), photoSyncWithGoogle: false }, "https://lh3.googleusercontent.com/c", UserModel);
    assert.deepEqual(updates[2], { googlePhotoURL: "https://lh3.googleusercontent.com/c" });
});

// --- Sessions -------------------------------------------------------------------

test("revoked sessions are recognised and IPs are shortened", () => {
    const user = { security: { revokedAuthTimes: [1700000000] } };
    assert.equal(isSessionRevoked(user, { authTime: 1700000000 }), true);
    assert.equal(isSessionRevoked(user, { authTime: 1700000001 }), false);
    assert.equal(isSessionRevoked(user, {}), false);
    assert.equal(shortenIp("203.0.113.45"), "203.0.113.x");
    assert.equal(shortenIp("::ffff:198.51.100.7"), "198.51.100.x");
    assert.equal(shortenIp("2001:db8:85a3:8d3:1319:8a2e:370:7348"), "2001:db8:85a3:8d3::");
    // Compressed IPv6 is expanded before shortening; loopback is named.
    assert.equal(shortenIp("2001:db8::1"), "2001:db8:0:0::");
    assert.equal(shortenIp("::1"), "This computer");
    assert.equal(shortenIp("127.0.0.1"), "This computer");
    assert.equal(shortenIp("not-an-ip"), null);
});

test("a revoked session is refused by the role check", async () => {
    mock.method(User, "findOne", async () => ({ _id: id(), role: "renter", isActive: true, security: { revokedAuthTimes: [1700000000] } }));
    const res = response();
    let nextCalled = false;
    await allowRoles("renter")({ user: { uid: "fb1", authTime: 1700000000 } }, res, () => { nextCalled = true; });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, "SESSION_REVOKED");
    assert.equal(nextCalled, false);
});

test("signing out one session or all others records their sign-in times", async () => {
    const user = { _id: id() };
    const pushes = [];
    const UserModel = { updateOne: async (filter, update) => pushes.push(update.$push["security.revokedAuthTimes"].$each) };
    const other = { _id: id(), authTime: 1700000000 };
    const current = { _id: id(), authTime: 1700009999 };

    const SessionModel = {
        findOne: () => lean(other),
        updateOne: async () => ({}),
        find: () => ({ select: () => lean([other]) }),
        updateMany: async () => ({}),
    };
    assert.deepEqual(await revokeSession(user, other._id, current.authTime, { SessionModel, UserModel }), { found: true, current: false });
    assert.deepEqual(pushes[0], [1700000000]);

    const own = { ...SessionModel, findOne: () => lean(current) };
    assert.deepEqual(await revokeSession(user, current._id, current.authTime, { SessionModel: own, UserModel }), { found: true, current: true });

    assert.equal(await revokeOtherSessions(user, current.authTime, { SessionModel, UserModel }), 1);
    assert.deepEqual(pushes[1], [1700000000]);
});

// --- Account deletion -----------------------------------------------------------

test("admins can't delete their own account", async () => {
    await assert.rejects(deleteAccount({ _id: id(), role: "admin" }), (error) => error.status === 403);
});

test("account deletion anonymises the user and removes their own data", async () => {
    const user = { _id: id(), role: "landlord", firebaseUid: "fb-123" };
    const property = { _id: id(), title: "Flat", status: "published", images: [id()] };
    const viewing = { _id: id(), renter: id(), property: property._id };
    mock.method(Property, "find", () => ({ setOptions: () => ({ select: () => lean([property]) }) }));
    const propertyUpdate = mock.method(Property, "updateMany", async () => ({}));
    let viewingCalls = 0;
    mock.method(ViewingRequest, "find", () => ({ select: () => lean(viewingCalls++ === 0 ? [viewing] : []) }));
    mock.method(ViewingRequest, "updateMany", async () => ({}));
    mock.method(Inquiry, "updateMany", async () => ({}));
    mock.method(SavedProperty, "deleteMany", async () => ({}));
    mock.method(User, "updateMany", async () => ({}));
    mock.method(VerificationRequest, "updateMany", async () => ({}));
    const fileUpdate = mock.method(UploadedFile, "updateMany", async () => ({ modifiedCount: 3 }));
    const removed = [];
    for (const Model of [SavedSearch, CopilotConversation, RenterPreference, Notification, NotificationDelivery, UserSession]) {
        mock.method(Model, "deleteMany", async () => { removed.push(Model.modelName); return {}; });
    }
    mock.method(Notification, "create", async (doc) => doc);
    const anonymise = mock.method(User.collection, "updateOne", async () => ({ modifiedCount: 1 }));
    const firebaseDeleted = [];

    const now = new Date("2030-01-01T00:00:00Z");
    const summary = await deleteAccount(user, { now, deleteFirebaseUser: async (uid) => firebaseDeleted.push(uid) });

    assert.equal(summary.listingsRemoved, 1);
    assert.equal(summary.viewingsCancelled, 1);
    assert.equal(summary.filesScheduledForDeletion, 3);
    assert.equal(summary.signInRemoved, true);
    assert.deepEqual(firebaseDeleted, ["fb-123"]);
    // Listings hidden, without media, so the media can be purged.
    assert.deepEqual(propertyUpdate.mock.calls[0].arguments[1].$set, { status: "deleted", deletedAt: now, images: [], videos: [], floorPlans: [] });
    // Media deleted after the retention period.
    assert.equal(
        fileUpdate.mock.calls[0].arguments[1].$set.retentionUntil.getTime(),
        now.getTime() + env.ACCOUNT_DELETION_FILE_RETENTION_DAYS * 24 * 60 * 60 * 1000
    );
    assert.equal(removed.length, 6);

    const [filter, update] = anonymise.mock.calls[0].arguments;
    assert.equal(String(filter._id), String(user._id));
    assert.equal(update.$set.displayName, "Deleted user");
    assert.equal(update.$set.email, null);
    assert.equal(update.$set.phoneNumber, null);
    assert.equal(update.$set.isActive, false);
    assert.match(update.$set.firebaseUid, /^deleted:/);
    assert.deepEqual(update.$unset, { profile: "", privacy: "", identity: "", security: "" });
});
