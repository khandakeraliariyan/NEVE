import mongoose from "mongoose";
import ConditionReport from "../models/ConditionReport.js";
import MaintenanceRequest from "../models/MaintenanceRequest.js";
import TenancyAgreement from "../models/TenancyAgreement.js";
import UploadedFile from "../models/UploadedFile.js";
import User from "../models/User.js";
import { compareConditionReports } from "../services/conditionReport.service.js";
import { canTransitionMaintenanceStatus } from "../services/maintenanceRequest.service.js";
import {
    appendAuditEvent,
    canManageAgreement,
    findAccessibleAgreement,
    findParticipantAgreement,
} from "../services/tenancyAgreement.service.js";

const isValidId = mongoose.isValidObjectId;
const actorId = (req) => req.neveUser._id;
const conditions = ["excellent", "good", "fair", "poor", "damaged", "not_working"];
const meterTypes = ["electricity", "gas", "water"];
const responsibilities = ["renter", "landlord", "shared", "property_manager"];
const requestStatuses = [
    "submitted",
    "acknowledged",
    "in_progress",
    "awaiting_renter",
    "completed",
    "disputed",
    "cancelled",
];

async function getAgreement(
    req,
    res,
    { participantOnly = false, readOnly = false } = {}
) {
    if (!isValidId(req.params.agreementId)) {
        res.status(400).json({ success: false, message: "Invalid agreement ID." });
        return null;
    }
    const agreement = participantOnly
        ? await findParticipantAgreement(req.params.agreementId, actorId(req))
        : await findAccessibleAgreement(req.params.agreementId, actorId(req));
    if (!agreement) {
        res.status(404).json({ success: false, message: "Agreement not found." });
        return null;
    }
    if (!readOnly && !canManageAgreement(agreement, actorId(req))) {
        res.status(403).json({
            success: false,
            message: "Only agreement participants or the assigned property manager can change these records.",
        });
        return null;
    }
    return agreement;
}

function privateResponse(res) {
    return res.set("Cache-Control", "private, no-store");
}

function appendAgreementAudit(agreement, actor, action, targetType, targetId) {
    agreement.auditTrail.push({
        actor,
        action,
        targetType,
        targetId: targetId && isValidId(targetId) ? targetId : null,
        createdAt: new Date(),
    });
    if (agreement.auditTrail.length > 100) {
        agreement.auditTrail.splice(0, agreement.auditTrail.length - 100);
    }
}

async function getOwnedEvidenceFiles(fileIds, userId) {
    if (
        !Array.isArray(fileIds) ||
        fileIds.length > 10 ||
        !fileIds.every(isValidId)
    ) {
        return null;
    }
    if (fileIds.length === 0) return [];
    const files = await UploadedFile.find({
        _id: { $in: fileIds },
        uploadedBy: userId,
        purpose: "tenancy_evidence",
        status: "uploaded",
    }).select("_id");
    return files.length === new Set(fileIds.map(String)).size
        ? files.map((file) => file._id)
        : null;
}

function parseConditionEntry(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    const {
        kind,
        room = "",
        item = "",
        condition = null,
        meterType = null,
        reading = null,
        unit = "",
        notes = "",
        photoFileIds = [],
    } = body;

    if (
        !["room_condition", "meter_reading"].includes(kind) ||
        typeof room !== "string" ||
        typeof item !== "string" ||
        typeof notes !== "string" ||
        notes.length > 2000 ||
        typeof unit !== "string" ||
        unit.length > 30 ||
        !Array.isArray(photoFileIds) ||
        photoFileIds.length > 10
    ) {
        return null;
    }

    if (kind === "room_condition") {
        if (
            !room.trim() ||
            room.length > 100 ||
            !item.trim() ||
            item.length > 100 ||
            !conditions.includes(condition)
        ) {
            return null;
        }
        return {
            kind,
            room: room.trim(),
            item: item.trim(),
            condition,
            meterType: null,
            reading: null,
            unit: "",
            notes: notes.trim(),
            photoFileIds,
            recordKey: `room:${room.trim().toLowerCase()}:${item.trim().toLowerCase()}`,
        };
    }

    if (
        !meterTypes.includes(meterType) ||
        typeof reading !== "number" ||
        !Number.isFinite(reading) ||
        reading < 0 ||
        !unit.trim()
    ) {
        return null;
    }
    return {
        kind,
        room: "",
        item: "",
        condition: null,
        meterType,
        reading,
        unit: unit.trim(),
        notes: notes.trim(),
        photoFileIds,
        recordKey: `meter:${meterType}`,
    };
}

export async function assignPropertyManager(req, res, next) {
    try {
        const agreement = await getAgreement(req, res, { participantOnly: true });
        if (!agreement) return;
        const { managerId = null } = req.body ?? {};

        if (managerId === null) {
            agreement.assignedPropertyManager = null;
            agreement.propertyManagerAssignedBy = actorId(req);
            agreement.propertyManagerAssignedAt = new Date();
            appendAgreementAudit(
                agreement,
                actorId(req),
                "property_manager_unassigned",
                "property_manager"
            );
        } else {
            if (!isValidId(managerId)) {
                return res.status(400).json({
                    success: false,
                    message: "A valid property manager ID or null is required.",
                });
            }
            const manager = await User.findOne({
                _id: managerId,
                role: "property_manager",
                isActive: true,
            }).select("_id displayName role");
            if (!manager) {
                return res.status(404).json({
                    success: false,
                    message: "Active property manager not found.",
                });
            }

            agreement.assignedPropertyManager = manager._id;
            agreement.propertyManagerAssignedBy = actorId(req);
            agreement.propertyManagerAssignedAt = new Date();
            appendAgreementAudit(
                agreement,
                actorId(req),
                "property_manager_assigned",
                "property_manager",
                manager._id
            );
        }

        await agreement.save();
        await agreement.populate(
            "assignedPropertyManager",
            "displayName photoURL role"
        );
        privateResponse(res);
        return res.json({
            success: true,
            data: {
                assignedPropertyManager: agreement.assignedPropertyManager,
                assignedAt: agreement.propertyManagerAssignedAt,
            },
        });
    } catch (error) {
        next(error);
    }
}

export async function createConditionReport(req, res, next) {
    try {
        const agreement = await getAgreement(req, res);
        if (!agreement) return;
        const { stage } = req.params;
        if (!["move_in", "move_out"].includes(stage)) {
            return res.status(400).json({
                success: false,
                message: "Stage must be move_in or move_out.",
            });
        }

        const report = await ConditionReport.create({
            agreement: agreement._id,
            property: agreement.property,
            stage,
            createdBy: actorId(req),
        });
        appendAgreementAudit(
            agreement,
            actorId(req),
            `${stage}_condition_report_created`,
            "condition_report",
            report._id
        );
        await agreement.save();
        privateResponse(res);
        return res.status(201).json({ success: true, data: report });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "A report for this stage already exists.",
            });
        }
        next(error);
    }
}

export async function addConditionEntry(req, res, next) {
    try {
        const agreement = await getAgreement(req, res);
        if (!agreement) return;
        const { reportId } = req.params;
        if (!isValidId(reportId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid condition report ID.",
            });
        }
        const report = await ConditionReport.findOne({
            _id: reportId,
            agreement: agreement._id,
            finalizedAt: null,
        });
        if (!report) {
            return res.status(404).json({
                success: false,
                message: "Open condition report not found.",
            });
        }
        const input = parseConditionEntry(req.body);
        if (!input) {
            return res.status(400).json({
                success: false,
                message: "Provide valid room-condition or meter-reading fields.",
            });
        }
        const supersededEntryIds = new Set(
            report.entries
                .map((entry) => entry.supersedes)
                .filter(Boolean)
                .map(String)
        );
        if (
            report.entries.some(
                (entry) =>
                    !supersededEntryIds.has(String(entry._id)) &&
                    entry.recordKey === input.recordKey
            )
        ) {
            return res.status(409).json({
                success: false,
                message: "An entry for this room/item or meter already exists; submit a correction instead.",
            });
        }
        const photos = await getOwnedEvidenceFiles(
            input.photoFileIds,
            actorId(req)
        );
        if (!photos) {
            return res.status(400).json({
                success: false,
                message: "Every photo must be an uploaded tenancy-evidence file owned by you.",
            });
        }

        report.entries.push({
            ...input,
            photos,
            recordedBy: actorId(req),
            recordedAt: new Date(),
        });
        await report.save();
        appendAgreementAudit(
            agreement,
            actorId(req),
            "condition_entry_added",
            "condition_report",
            report._id
        );
        await agreement.save();
        privateResponse(res);
        return res.status(201).json({
            success: true,
            data: report.entries.at(-1),
        });
    } catch (error) {
        next(error);
    }
}

export async function correctConditionEntry(req, res, next) {
    try {
        const agreement = await getAgreement(req, res);
        if (!agreement) return;
        const { reportId, entryId } = req.params;
        if (!isValidId(reportId) || !isValidId(entryId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid condition report or entry ID.",
            });
        }
        const report = await ConditionReport.findOne({
            _id: reportId,
            agreement: agreement._id,
            finalizedAt: null,
        });
        const original = report?.entries.id(entryId);
        if (!report || !original) {
            return res.status(404).json({
                success: false,
                message: "Open condition entry not found.",
            });
        }
        if (report.entries.some((entry) => String(entry.supersedes) === String(original._id))) {
            return res.status(409).json({
                success: false,
                message: "This entry has already been corrected.",
            });
        }
        const input = parseConditionEntry(req.body);
        if (!input || input.recordKey !== original.recordKey) {
            return res.status(400).json({
                success: false,
                message: "A correction must be valid and keep the original room/item or meter identity.",
            });
        }
        const photos = await getOwnedEvidenceFiles(input.photoFileIds, actorId(req));
        if (!photos) {
            return res.status(400).json({
                success: false,
                message: "Every photo must be an uploaded tenancy-evidence file owned by you.",
            });
        }

        report.entries.push({
            ...input,
            photos,
            recordedBy: actorId(req),
            recordedAt: new Date(),
            supersedes: original._id,
        });
        await report.save();
        appendAgreementAudit(
            agreement,
            actorId(req),
            "condition_entry_corrected",
            "condition_report",
            report._id
        );
        await agreement.save();
        privateResponse(res);
        return res.status(201).json({
            success: true,
            message: "Correction appended; the original entry was preserved.",
            data: report.entries.at(-1),
        });
    } catch (error) {
        next(error);
    }
}

export async function reviewConditionEntry(req, res, next) {
    try {
        const agreement = await getAgreement(req, res);
        if (!agreement) return;
        const { reportId, entryId } = req.params;
        if (!isValidId(reportId) || !isValidId(entryId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid condition report or entry ID.",
            });
        }
        const { decision, note = "" } = req.body ?? {};
        if (
            !["confirmed", "disputed"].includes(decision) ||
            typeof note !== "string" ||
            note.length > 1000
        ) {
            return res.status(400).json({
                success: false,
                message: "Provide a confirmation or dispute and an optional note up to 1000 characters.",
            });
        }
        const report = await ConditionReport.findOne({
            _id: reportId,
            agreement: agreement._id,
        });
        const entry = report?.entries.id(entryId);
        if (
            !entry ||
            report.entries.some(
                (candidate) => String(candidate.supersedes) === String(entry._id)
            )
        ) {
            return res.status(404).json({
                success: false,
                message: "Current condition entry not found.",
            });
        }
        entry.reviewEvents.push({
            actor: actorId(req),
            decision,
            note: note.trim(),
            createdAt: new Date(),
        });
        await report.save();
        appendAgreementAudit(
            agreement,
            actorId(req),
            `condition_entry_${decision}`,
            "condition_report",
            report._id
        );
        await agreement.save();
        privateResponse(res);
        return res.json({ success: true, data: entry });
    } catch (error) {
        next(error);
    }
}

export async function getConditionComparison(req, res, next) {
    try {
        const agreement = await getAgreement(req, res, { readOnly: true });
        if (!agreement) return;
        const reports = await ConditionReport.find({
            agreement: agreement._id,
        }).lean();
        const moveIn = reports.find((report) => report.stage === "move_in");
        const moveOut = reports.find((report) => report.stage === "move_out");
        appendAgreementAudit(
            agreement,
            actorId(req),
            "condition_report_comparison_viewed",
            "agreement"
        );
        await agreement.save();
        privateResponse(res);
        return res.json({
            success: true,
            agreementId: agreement._id,
            comparison: compareConditionReports(moveIn, moveOut),
        });
    } catch (error) {
        next(error);
    }
}

export async function listConditionReports(req, res, next) {
    try {
        const agreement = await getAgreement(req, res, { readOnly: true });
        if (!agreement) return;
        const reports = await ConditionReport.find({
            agreement: agreement._id,
        })
            .populate("createdBy", "displayName photoURL role")
            .populate("entries.recordedBy", "displayName photoURL role")
            .populate("entries.reviewEvents.actor", "displayName photoURL role")
            .populate(
                "entries.photos",
                "originalName mimeType sizeBytes status"
            )
            .sort({ stage: 1 })
            .lean();
        appendAgreementAudit(
            agreement,
            actorId(req),
            "condition_reports_viewed",
            "agreement"
        );
        await agreement.save();
        privateResponse(res);
        return res.json({
            success: true,
            agreementId: agreement._id,
            data: reports,
        });
    } catch (error) {
        next(error);
    }
}

async function getAccessibleRequest(req, res) {
    if (!isValidId(req.params.requestId)) {
        res.status(400).json({
            success: false,
            message: "Invalid maintenance request ID.",
        });
        return null;
    }
    const request = await MaintenanceRequest.findById(req.params.requestId);
    if (!request) {
        res.status(404).json({
            success: false,
            message: "Maintenance request not found.",
        });
        return null;
    }
    const agreement = await findAccessibleAgreement(
        request.agreement,
        actorId(req)
    );
    if (!agreement) {
        res.status(404).json({
            success: false,
            message: "Maintenance request not found.",
        });
        return null;
    }
    if (!canManageAgreement(agreement, actorId(req))) {
        res.status(403).json({
            success: false,
            message: "Only agreement participants or the assigned property manager can update maintenance requests.",
        });
        return null;
    }
    return { request, agreement };
}

export async function createMaintenanceRequest(req, res, next) {
    try {
        const agreement = await getAgreement(req, res);
        if (!agreement) return;
        const {
            title,
            description,
            category = "other",
            priority = "normal",
            responsibility = null,
            evidenceFileIds = [],
        } = req.body ?? {};
        if (
            typeof title !== "string" ||
            !title.trim() ||
            title.trim().length > 150 ||
            typeof description !== "string" ||
            !description.trim() ||
            description.trim().length > 4000 ||
            ![
                "plumbing",
                "electrical",
                "appliance",
                "structure",
                "pest",
                "heating_cooling",
                "other",
            ].includes(category) ||
            !["low", "normal", "high", "urgent"].includes(priority) ||
            (responsibility !== null &&
                !responsibilities.includes(responsibility))
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid maintenance request fields.",
            });
        }
        const evidenceFiles = await getOwnedEvidenceFiles(
            evidenceFileIds,
            actorId(req)
        );
        if (!evidenceFiles) {
            return res.status(400).json({
                success: false,
                message: "Every attachment must be an uploaded tenancy-evidence file owned by you.",
            });
        }

        const request = await MaintenanceRequest.create({
            agreement: agreement._id,
            property: agreement.property,
            title: title.trim(),
            description: description.trim(),
            category,
            priority,
            responsibility,
            submittedBy: actorId(req),
            evidenceFiles,
            history: [{
                actor: actorId(req),
                message: description.trim(),
                status: "submitted",
                responsibility,
                evidenceFiles,
            }],
        });
        appendAgreementAudit(
            agreement,
            actorId(req),
            "maintenance_request_submitted",
            "maintenance_request",
            request._id
        );
        await agreement.save();
        privateResponse(res);
        return res.status(201).json({
            success: true,
            message: "Maintenance request submitted.",
            data: request,
        });
    } catch (error) {
        next(error);
    }
}

export async function listMaintenanceRequests(req, res, next) {
    try {
        const page = Number(req.query.page ?? 1);
        const limit = Number(req.query.limit ?? 20);
        if (
            !Number.isInteger(page) ||
            page < 1 ||
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 100
        ) {
            return res.status(400).json({
                success: false,
                message: "Page must be positive and limit must be between 1 and 100.",
            });
        }
        const agreements = await TenancyAgreement.find({
            $or: [
                { renter: actorId(req) },
                { landlord: actorId(req) },
                { assignedPropertyManager: actorId(req) },
                { sharedWith: { $elemMatch: { user: actorId(req), revokedAt: null } } },
            ],
        }).select("_id");
        const agreementIds = agreements.map((agreement) => agreement._id);
        const filter = { agreement: { $in: agreementIds } };
        if (req.query.status !== undefined) {
            if (!requestStatuses.includes(req.query.status)) {
                return res.status(400).json({
                    success: false,
                    message: "Unsupported maintenance request status.",
                });
            }
            filter.status = req.query.status;
        }
        const [requests, total] = await Promise.all([
            MaintenanceRequest.find(filter)
                .populate("submittedBy", "displayName photoURL role")
                .populate("property", "title address")
                .sort({ updatedAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            MaintenanceRequest.countDocuments(filter),
        ]);
        privateResponse(res);
        return res.json({
            success: true,
            data: requests,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        next(error);
    }
}

export async function updateMaintenanceRequest(req, res, next) {
    try {
        const result = await getAccessibleRequest(req, res);
        if (!result) return;
        const { request, agreement } = result;
        const {
            message = "",
            status,
            responsibility,
            evidenceFileIds = [],
        } = req.body ?? {};
        if (
            typeof message !== "string" ||
            message.length > 2000 ||
            (status !== undefined && !requestStatuses.includes(status)) ||
            (responsibility !== undefined &&
                responsibility !== null &&
                !responsibilities.includes(responsibility)) ||
            !Array.isArray(evidenceFileIds)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid maintenance progress fields.",
            });
        }
        if (
            !message.trim() &&
            status === undefined &&
            responsibility === undefined &&
            evidenceFileIds.length === 0
        ) {
            return res.status(400).json({
                success: false,
                message: "Provide a progress message, status, responsibility, or evidence.",
            });
        }
        if (request.status === "cancelled") {
            return res.status(409).json({
                success: false,
                message: "Cancelled requests cannot be changed.",
            });
        }
        if (
            status !== undefined &&
            !canTransitionMaintenanceStatus(request.status, status)
        ) {
            return res.status(409).json({
                success: false,
                message: `Maintenance requests cannot transition from ${request.status} to ${status}.`,
            });
        }
        if (
            status === "cancelled" &&
            String(request.submittedBy) !== String(actorId(req)) &&
            String(agreement.landlord) !== String(actorId(req)) &&
            String(agreement.assignedPropertyManager ?? "") !==
                String(actorId(req))
        ) {
            return res.status(403).json({
                success: false,
                message: "Only the requester or assigned property manager can cancel this request.",
            });
        }
        const actorIsRenter =
            String(agreement.renter) === String(actorId(req));
        if (
            actorIsRenter &&
            status !== undefined &&
            !["disputed", "cancelled"].includes(status)
        ) {
            return res.status(403).json({
                success: false,
                message: "Renters may dispute or cancel a request, but only the landlord or assigned manager can progress it.",
            });
        }
        if (
            actorIsRenter &&
            responsibility !== undefined
        ) {
            return res.status(403).json({
                success: false,
                message: "Only the landlord or assigned manager can assign repair responsibility.",
            });
        }
        const evidenceFiles = await getOwnedEvidenceFiles(
            evidenceFileIds,
            actorId(req)
        );
        if (!evidenceFiles) {
            return res.status(400).json({
                success: false,
                message: "Every attachment must be an uploaded tenancy-evidence file owned by you.",
            });
        }

        if (status !== undefined) {
            request.status = status;
            if (status === "completed") {
                request.completedAt = new Date();
            }
        }
        if (responsibility !== undefined) {
            request.responsibility = responsibility;
        }
        request.history.push({
            actor: actorId(req),
            message: message.trim(),
            status: status ?? null,
            responsibility: responsibility ?? null,
            evidenceFiles,
            createdAt: new Date(),
        });
        await request.save();
        appendAgreementAudit(
            agreement,
            actorId(req),
            "maintenance_request_updated",
            "maintenance_request",
            request._id
        );
        await agreement.save();
        privateResponse(res);
        return res.json({ success: true, data: request });
    } catch (error) {
        next(error);
    }
}
