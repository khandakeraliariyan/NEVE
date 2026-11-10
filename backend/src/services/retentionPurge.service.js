import ConditionReport from "../models/ConditionReport.js";
import EvidenceLink from "../models/EvidenceLink.js";
import MaintenanceRequest from "../models/MaintenanceRequest.js";
import Property from "../models/Property.js";
import TenancyAgreement from "../models/TenancyAgreement.js";
import TenancyCase from "../models/TenancyCase.js";
import TenancyEvidenceLink from "../models/TenancyEvidenceLink.js";
import UploadedFile from "../models/UploadedFile.js";
import User from "../models/User.js";
import VerificationRequest from "../models/VerificationRequest.js";
import { env } from "../config/env.js";
import { deleteStoredObject } from "./fileUpload.service.js";

// Deletes files Neve no longer needs to keep:
// - uploads that were started but never confirmed (abandoned_upload)
// - tenancy evidence whose retention date has passed, that has no legal hold
//   and isn't used by any tenancy record (retention_ended)
// - identity and ownership documents from requests reviewed or cancelled more
//   than VERIFICATION_DOCUMENT_RETENTION_DAYS ago (verification_closed)
// - photos and listing media of deleted accounts once their retention date
//   passes (retention_ended)
// Referenced files and files under legal hold are never deleted.
// clearClosedIdentityDetails also removes the encrypted ID number and date of
// birth from verification requests closed that long ago.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MAX_FILES_PER_RUN = 500;
// File kinds deleted once their retentionUntil date passes.
const RETENTION_DATED_PURPOSES = [
    "tenancy_evidence",
    "profile_photo",
    "property_image",
    "property_video",
    "floor_plan",
];

// The verified number and date of birth stay on the user's profile; the
// copies on closed requests are removed after the document retention period.
export async function clearClosedIdentityDetails(now = new Date(), Requests = VerificationRequest) {
    const closedBefore = new Date(now.getTime() - env.VERIFICATION_DOCUMENT_RETENTION_DAYS * DAY_MS);
    const result = await Requests.updateMany(
        {
            type: "identity",
            status: { $in: ["approved", "rejected", "cancelled"] },
            updatedAt: { $lte: closedBefore },
            $or: [
                { "identityDetails.idNumber": { $exists: true } },
                { "identityDetails.dateOfBirth": { $exists: true } },
            ],
        },
        { $unset: { "identityDetails.idNumber": "", "identityDetails.dateOfBirth": "" } },
        { timestamps: false }
    );
    return result.modifiedCount ?? 0;
}

export async function isFileReferenced(fileId) {
    const checks = await Promise.all([
        TenancyAgreement.exists({
            $or: [
                { documentFile: fileId },
                { "obligations.evidenceFile": fileId },
                { "payments.receiptFile": fileId },
                { "extraction.sourceFile": fileId },
            ],
        }),
        TenancyEvidenceLink.exists({ uploadedFile: fileId }),
        EvidenceLink.exists({ uploadedFile: fileId }),
        ConditionReport.exists({ "entries.photos": fileId }),
        MaintenanceRequest.exists({
            $or: [{ evidenceFiles: fileId }, { "history.evidenceFiles": fileId }],
        }),
        TenancyCase.exists({ "evidence.file": fileId }),
        Property.exists({
            $or: [{ images: fileId }, { videos: fileId }, { floorPlans: fileId }],
        }),
        User.exists({ profilePhoto: fileId }),
        VerificationRequest.exists({ documents: fileId, status: "pending" }),
    ]);
    return checks.some(Boolean);
}

export async function findPurgeCandidates(now = new Date()) {
    const abandoned = await UploadedFile.find({
        status: "pending_upload",
        createdAt: { $lte: new Date(now.getTime() - env.ABANDONED_UPLOAD_HOURS * HOUR_MS) },
    })
        .select("_id storageKey purpose")
        .limit(MAX_FILES_PER_RUN)
        .lean();

    const retentionEnded = await UploadedFile.find({
        purpose: { $in: RETENTION_DATED_PURPOSES },
        status: "uploaded",
        legalHold: false,
        retentionUntil: { $ne: null, $lte: now },
    })
        .select("_id storageKey purpose")
        .limit(MAX_FILES_PER_RUN)
        .lean();

    const closedBefore = new Date(now.getTime() - env.VERIFICATION_DOCUMENT_RETENTION_DAYS * DAY_MS);
    const closedRequests = await VerificationRequest.find({
        status: { $in: ["approved", "rejected", "cancelled"] },
        updatedAt: { $lte: closedBefore },
    })
        .select("documents")
        .limit(MAX_FILES_PER_RUN)
        .lean();
    const verificationFileIds = [...new Set(closedRequests.flatMap((request) => request.documents.map(String)))];
    const verificationClosed = verificationFileIds.length
        ? await UploadedFile.find({
            _id: { $in: verificationFileIds },
            purpose: "verification_document",
            status: "uploaded",
            legalHold: false,
        })
            .select("_id storageKey purpose")
            .lean()
        : [];

    return [
        ...abandoned.map((file) => ({ ...file, reason: "abandoned_upload" })),
        ...retentionEnded.map((file) => ({ ...file, reason: "retention_ended" })),
        ...verificationClosed.map((file) => ({ ...file, reason: "verification_closed" })),
    ].slice(0, MAX_FILES_PER_RUN);
}

const isMissingObject = (error) =>
    error?.name === "NoSuchKey" || error?.Code === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404;

export async function runRetentionPurge({ dryRun = false, now = new Date(), deps = {} } = {}) {
    const findCandidates = deps.findPurgeCandidates ?? findPurgeCandidates;
    const referenced = deps.isFileReferenced ?? isFileReferenced;
    const removeObject = deps.deleteStoredObject ?? deleteStoredObject;
    const Files = deps.UploadedFile ?? UploadedFile;

    const candidates = await findCandidates(now);
    const summary = {
        candidates: candidates.length,
        deleted: 0,
        skippedReferenced: 0,
        skippedChanged: 0,
        failed: 0,
        byReason: {},
        deletedFileIds: [],
        failedFileIds: [],
    };

    for (const file of candidates) {
        if (await referenced(file._id)) {
            summary.skippedReferenced += 1;
            continue;
        }
        if (dryRun) {
            summary.byReason[file.reason] = (summary.byReason[file.reason] ?? 0) + 1;
            summary.deletedFileIds.push(String(file._id));
            continue;
        }

        // Lock the file so a concurrent edit (new legal hold, new retention
        // date, finished upload) stops the deletion.
        const lockFilter = { _id: file._id };
        if (file.reason === "abandoned_upload") {
            lockFilter.status = "pending_upload";
        } else {
            lockFilter.status = "uploaded";
            lockFilter.legalHold = false;
            if (file.reason === "retention_ended") {
                lockFilter.retentionUntil = { $ne: null, $lte: now };
            }
        }
        const locked = await Files.findOneAndUpdate(lockFilter, { $set: { status: "deletion_pending" } }, { new: true });
        if (!locked) {
            summary.skippedChanged += 1;
            continue;
        }

        try {
            try {
                await removeObject(file.storageKey);
            } catch (error) {
                if (!isMissingObject(error) && file.reason !== "abandoned_upload") throw error;
            }
            await Files.deleteOne({ _id: file._id });
            summary.deleted += 1;
            summary.byReason[file.reason] = (summary.byReason[file.reason] ?? 0) + 1;
            summary.deletedFileIds.push(String(file._id));
        } catch (error) {
            console.error("Retention purge error:", error);
            await Files.updateOne(
                { _id: file._id, status: "deletion_pending" },
                { $set: { status: file.reason === "abandoned_upload" ? "pending_upload" : "uploaded" } }
            );
            summary.failed += 1;
            summary.failedFileIds.push(String(file._id));
        }
    }

    summary.dryRun = dryRun;
    return summary;
}
