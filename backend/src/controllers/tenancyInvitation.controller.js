import mongoose from "mongoose";
import { z } from "zod";

import { env } from "../config/env.js";
import Inquiry from "../models/Inquiry.js";
import Property from "../models/Property.js";
import TenancyAgreement from "../models/TenancyAgreement.js";
import TenancyInvitation from "../models/TenancyInvitation.js";
import UploadedFile from "../models/UploadedFile.js";
import User from "../models/User.js";
import { createNotification } from "../services/notification.service.js";
import { isEmailConfigured, sendEmail } from "../services/notificationDelivery.service.js";
import { escapeHtml, formatBdt } from "../services/notificationTemplates.js";
import { recordSensitiveAccess } from "../services/sensitiveAccess.service.js";
import { getSettings } from "../services/platformSettings.service.js";

// Landlords invite a renter (by email) to start a tenancy record; the renter
// accepts while signed in with that email, which creates the agreement.

const validId = mongoose.isValidObjectId;
const privateResponse = (res) => res.set("Cache-Control", "private, no-store");

const optionalAmount = z.number().finite().min(0).nullable().optional();
const optionalDate = z
    .string()
    .refine((value) => Number.isFinite(Date.parse(value)), "must be a date")
    .nullable()
    .optional();

export const InvitationSchema = z
    .object({
        propertyId: z.string().refine(validId, "must be a property ID"),
        renterEmail: z.string().trim().toLowerCase().email().max(254),
        title: z.string().trim().min(1).max(150),
        message: z.string().trim().max(1000).optional().default(""),
        startAt: optionalDate,
        endAt: optionalDate,
        monthlyRentBdt: optionalAmount,
        depositBdt: optionalAmount,
        advanceRentBdt: optionalAmount,
        fileId: z.string().refine(validId, "must be a file ID").nullable().optional(),
    })
    .strict()
    .refine((value) => !value.startAt || !value.endAt || Date.parse(value.endAt) >= Date.parse(value.startAt), {
        message: "endAt can't be before startAt",
        path: ["endAt"],
    });

export function invitationLink(invitationId) {
    return `${env.CLIENT_URL.replace(/\/$/, "")}/invitations/${invitationId}`;
}

// Expired invitations read as expired even before anything updates them.
export function effectiveStatus(invitation, now = new Date()) {
    if (invitation.status === "pending" && new Date(invitation.expiresAt) <= now) return "expired";
    return invitation.status;
}

function view(invitation, viewerRole) {
    const plain = invitation.toObject?.() ?? invitation;
    return {
        ...plain,
        status: effectiveStatus(plain),
        link: viewerRole === "landlord" ? invitationLink(plain._id) : undefined,
    };
}

function emailMatches(user, tokenUser, invitation) {
    const email = String(user?.email ?? tokenUser?.email ?? "").toLowerCase();
    return Boolean(email) && email === invitation.inviteeEmail;
}

function emailVerified(user, tokenUser) {
    return tokenUser?.emailVerified === true || user?.verification?.email?.verified === true;
}

async function sendInvitationEmail(invitation, property, landlordName) {
    const link = invitationLink(invitation._id);
    const days = Math.max(1, Math.round((new Date(invitation.expiresAt) - Date.now()) / 86_400_000));
    const terms = [
        invitation.monthlyRentBdt ? `Rent: ${formatBdt(invitation.monthlyRentBdt)} per month` : null,
        invitation.depositBdt ? `Deposit: ${formatBdt(invitation.depositBdt)}` : null,
    ].filter(Boolean);
    const subject = `${landlordName} invited you to a tenancy record on Neve`;
    const text = [
        "Hi,",
        "",
        `${landlordName} invited you to keep the tenancy records for ${property.title} on Neve: the agreement, payments, condition reports and repairs, in one private place.`,
        ...terms,
        invitation.message ? `\nTheir message: "${invitation.message}"` : "",
        "",
        `Open the invitation: ${link}`,
        `Sign in or create a renter account with this email address (${invitation.inviteeEmail}) to accept. The invitation expires in ${days} days.`,
        "",
        "Never pay a deposit before verifying the property and the landlord.",
    ].join("\n");
    const html = `<p>Hi,</p><p>${escapeHtml(landlordName)} invited you to keep the tenancy records for <strong>${escapeHtml(property.title)}</strong> on Neve.</p>${terms.map((t) => `<p>${escapeHtml(t)}</p>`).join("")}${invitation.message ? `<blockquote>${escapeHtml(invitation.message)}</blockquote>` : ""}<p><a href="${escapeHtml(link)}">Open the invitation</a></p><p>Sign in or create a renter account with ${escapeHtml(invitation.inviteeEmail)} to accept. It expires in ${days} days.</p><p>Never pay a deposit before verifying the property and the landlord.</p>`;
    await sendEmail({ to: invitation.inviteeEmail, subject, text, html }, { idempotencyKey: `tenancy_invitation:${invitation._id}` });
}

// POST /api/v1/tenancy/invitations
export async function createInvitation(req, res, next) {
    try {
        if (req.neveUser.role !== "landlord") {
            return res.status(403).json({ success: false, message: "Only landlords can invite a renter." });
        }
        const parsed = InvitationSchema.safeParse(req.body ?? {});
        if (!parsed.success) {
            const issue = parsed.error.issues[0];
            return res.status(400).json({ success: false, message: `${issue.path.join(".") || "body"}: ${issue.message}` });
        }
        const value = parsed.data;
        if (value.renterEmail === String(req.neveUser.email ?? "").toLowerCase()) {
            return res.status(400).json({ success: false, message: "You can't invite yourself." });
        }
        const property = await Property.findOne({ _id: value.propertyId, landlord: req.neveUser._id }).select("_id title");
        if (!property) return res.status(404).json({ success: false, message: "Property not found." });

        let documentFile = null;
        if (value.fileId) {
            const file = await UploadedFile.exists({
                _id: value.fileId,
                uploadedBy: req.neveUser._id,
                purpose: "tenancy_evidence",
                status: "uploaded",
            });
            if (!file) return res.status(404).json({ success: false, message: "Uploaded agreement document not found." });
            documentFile = value.fileId;
        }

        // A pending invitation that already expired doesn't block a new one.
        await TenancyInvitation.updateMany(
            { property: property._id, inviteeEmail: value.renterEmail, status: "pending", expiresAt: { $lte: new Date() } },
            { $set: { status: "expired" } }
        );
        let invitation;
        try {
            invitation = await TenancyInvitation.create({
                property: property._id,
                landlord: req.neveUser._id,
                inviteeEmail: value.renterEmail,
                title: value.title,
                message: value.message,
                startAt: value.startAt ? new Date(value.startAt) : null,
                endAt: value.endAt ? new Date(value.endAt) : null,
                monthlyRentBdt: value.monthlyRentBdt ?? null,
                depositBdt: value.depositBdt ?? null,
                advanceRentBdt: value.advanceRentBdt ?? null,
                documentFile,
                expiresAt: new Date(Date.now() + (await getSettings()).invitationExpiryDays * 24 * 60 * 60 * 1000),
            });
        } catch (createError) {
            if (createError.code === 11000) {
                return res.status(409).json({ success: false, message: "This renter already has an open invitation for this property." });
            }
            throw createError;
        }

        // Tell the renter: in the app if they have an account, otherwise by email.
        const invitee = await User.findOne({ email: value.renterEmail, isActive: true, deletedAt: null }).select("_id");
        let delivery = "link_only";
        if (invitee) {
            await createNotification({
                recipient: invitee._id,
                type: "tenancy_invitation_received",
                title: `${req.neveUser.displayName} invited you to a tenancy record`,
                message: `${req.neveUser.displayName} invited you to keep the tenancy records for ${property.title} on Neve. Open the invitation to accept or decline.`,
                link: `/invitations/${invitation._id}`,
                relatedProperty: property._id,
            }).catch((error) => console.error("Invitation notification error:", error));
            delivery = "in_app";
        } else if (isEmailConfigured()) {
            try {
                await sendInvitationEmail(invitation, property, req.neveUser.displayName);
                delivery = "email";
            } catch (error) {
                console.error("Invitation email error:", error.message ?? error);
            }
        }
        invitation.delivery = delivery;
        await invitation.save();

        privateResponse(res);
        return res.status(201).json({
            success: true,
            message:
                delivery === "in_app"
                    ? "Invitation sent. The renter will see it in Neve."
                    : delivery === "email"
                        ? "Invitation emailed to the renter."
                        : "Invitation created. Email isn't set up, so share the link with the renter yourself.",
            data: view(invitation, "landlord"),
        });
    } catch (error) {
        next(error);
    }
}

// GET /api/v1/tenancy/invitations
// Landlords: invitations they sent. Others: invitations to their email.
export async function listInvitations(req, res, next) {
    try {
        const user = req.neveUser;
        const filter = user.role === "landlord"
            ? { landlord: user._id }
            : { inviteeEmail: String(user.email ?? "").toLowerCase() || "\u0000" };
        const invitations = await TenancyInvitation.find(filter)
            .populate("property", "title address.area address.city")
            .populate("landlord", "displayName photoURL")
            .sort({ createdAt: -1 })
            .limit(100);
        privateResponse(res);
        return res.json({ success: true, data: invitations.map((item) => view(item, user.role === "landlord" ? "landlord" : "renter")) });
    } catch (error) {
        next(error);
    }
}

async function loadForViewer(req, res) {
    if (!validId(req.params.invitationId)) {
        res.status(400).json({ success: false, message: "Invalid invitation ID." });
        return null;
    }
    const invitation = await TenancyInvitation.findById(req.params.invitationId)
        .populate("property", "title address.area address.city pricing.monthlyRent")
        .populate("landlord", "displayName photoURL verification createdAt");
    const isLandlord = invitation && String(invitation.landlord?._id ?? invitation.landlord) === String(req.neveUser._id);
    const isInvitee = invitation && emailMatches(req.neveUser, req.user, invitation);
    if (!invitation || (!isLandlord && !isInvitee)) {
        res.status(404).json({
            success: false,
            message: "Invitation not found. Make sure you're signed in with the email address it was sent to.",
        });
        return null;
    }
    return { invitation, isLandlord, isInvitee };
}

// GET /api/v1/tenancy/invitations/:invitationId
export async function getInvitation(req, res, next) {
    try {
        const found = await loadForViewer(req, res);
        if (!found) return;
        const { invitation, isLandlord, isInvitee } = found;
        privateResponse(res);
        return res.json({
            success: true,
            data: {
                ...view(invitation, isLandlord ? "landlord" : "renter"),
                viewer: isLandlord ? "landlord" : "invitee",
                canRespond: isInvitee && effectiveStatus(invitation) === "pending",
                emailVerified: emailVerified(req.neveUser, req.user),
                renterAccount: req.neveUser.role === "renter",
            },
        });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/tenancy/invitations/:invitationId/accept
export async function acceptInvitation(req, res, next) {
    try {
        const found = await loadForViewer(req, res);
        if (!found) return;
        const { invitation, isInvitee } = found;
        if (!isInvitee) return res.status(403).json({ success: false, message: "Only the invited renter can accept." });
        if (effectiveStatus(invitation) !== "pending") {
            return res.status(409).json({ success: false, message: `This invitation is ${effectiveStatus(invitation)}.` });
        }
        if (req.neveUser.role !== "renter") {
            return res.status(409).json({ success: false, message: "Switch your account to renter in Settings to accept a tenancy invitation." });
        }
        if (!emailVerified(req.neveUser, req.user)) {
            return res.status(403).json({ success: false, message: "Verify your email address first, so we know the invitation is yours." });
        }
        const landlordId = invitation.landlord?._id ?? invitation.landlord;
        const propertyId = invitation.property?._id ?? invitation.property;

        // Claim the invitation first so two clicks can't create two agreements.
        const claimed = await TenancyInvitation.findOneAndUpdate(
            { _id: invitation._id, status: "pending", expiresAt: { $gt: new Date() } },
            { $set: { status: "accepted", invitee: req.neveUser._id, respondedAt: new Date() } },
            { new: true }
        );
        if (!claimed) return res.status(409).json({ success: false, message: "This invitation was already answered." });

        let agreement;
        try {
            const now = new Date();
            // The agreement's message thread between the two parties.
            const inquiry = await Inquiry.create({
                property: propertyId,
                renter: req.neveUser._id,
                landlord: landlordId,
                message: invitation.message || `Tenancy record for ${invitation.title}, started from the landlord's invitation.`,
                status: "accepted",
                respondedAt: now,
                firstLandlordReplyAt: now,
            });
            agreement = await TenancyAgreement.create({
                property: propertyId,
                inquiry: inquiry._id,
                renter: req.neveUser._id,
                landlord: landlordId,
                createdBy: landlordId,
                documentFile: invitation.documentFile ?? null,
                invitation: invitation._id,
                title: invitation.title,
                jurisdiction: "Bangladesh",
                startAt: invitation.startAt,
                endAt: invitation.endAt,
                monthlyRentBdt: invitation.monthlyRentBdt,
                depositBdt: invitation.depositBdt,
                advanceRentBdt: invitation.advanceRentBdt,
                status: "shared",
                auditTrail: [
                    { actor: landlordId, action: "agreement_invitation_sent", createdAt: invitation.createdAt },
                    { actor: req.neveUser._id, action: "agreement_created_from_invitation", createdAt: now },
                ],
            });
        } catch (error) {
            // Put the invitation back so the renter can try again.
            await TenancyInvitation.updateOne({ _id: invitation._id }, { $set: { status: "pending", invitee: null, respondedAt: null } });
            throw error;
        }
        await TenancyInvitation.updateOne({ _id: invitation._id }, { $set: { agreement: agreement._id } });

        await createNotification({
            recipient: landlordId,
            type: "tenancy_invitation_accepted",
            title: `${req.neveUser.displayName} accepted your tenancy invitation`,
            message: `The tenancy record "${invitation.title}" is ready. You can now add the agreement, payments and condition reports together.`,
            link: `/agreements/${agreement._id}`,
            relatedProperty: propertyId,
            relatedAgreement: agreement._id,
        }).catch((error) => console.error("Invitation accepted notification error:", error));
        await recordSensitiveAccess({
            actor: req.neveUser._id,
            action: "tenancy_invitation_accepted",
            resourceType: "agreement",
            resourceId: agreement._id,
            agreement: agreement._id,
            outcome: "completed",
            details: { invitation: String(invitation._id) },
            ipAddress: req.ip,
        }).catch(() => {});

        privateResponse(res);
        return res.status(201).json({
            success: true,
            message: "Invitation accepted. The tenancy record is shared with you and the landlord.",
            data: { agreementId: agreement._id },
        });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/tenancy/invitations/:invitationId/decline  { reason? }
export async function declineInvitation(req, res, next) {
    try {
        const found = await loadForViewer(req, res);
        if (!found) return;
        const { invitation, isInvitee } = found;
        if (!isInvitee) return res.status(403).json({ success: false, message: "Only the invited renter can decline." });
        const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 500) : "";
        const updated = await TenancyInvitation.findOneAndUpdate(
            { _id: invitation._id, status: "pending" },
            { $set: { status: "declined", invitee: req.neveUser._id, respondedAt: new Date(), declineReason: reason } },
            { new: true }
        );
        if (!updated) return res.status(409).json({ success: false, message: "This invitation was already answered." });
        await createNotification({
            recipient: invitation.landlord?._id ?? invitation.landlord,
            type: "tenancy_invitation_declined",
            title: "A renter declined your tenancy invitation",
            message: `${req.neveUser.displayName} declined the invitation for "${invitation.title}"${reason ? `: "${reason}"` : "."}`,
            link: "/invitations",
            relatedProperty: invitation.property?._id ?? invitation.property,
        }).catch((error) => console.error("Invitation declined notification error:", error));
        privateResponse(res);
        return res.json({ success: true, message: "Invitation declined.", data: view(updated, "renter") });
    } catch (error) {
        next(error);
    }
}

// POST /api/v1/tenancy/invitations/:invitationId/cancel
export async function cancelInvitation(req, res, next) {
    try {
        const found = await loadForViewer(req, res);
        if (!found) return;
        if (!found.isLandlord) return res.status(403).json({ success: false, message: "Only the landlord who sent it can cancel it." });
        const updated = await TenancyInvitation.findOneAndUpdate(
            { _id: found.invitation._id, status: "pending" },
            { $set: { status: "cancelled", respondedAt: new Date() } },
            { new: true }
        );
        if (!updated) return res.status(409).json({ success: false, message: "Only a pending invitation can be cancelled." });
        privateResponse(res);
        return res.json({ success: true, message: "Invitation cancelled.", data: view(updated, "landlord") });
    } catch (error) {
        next(error);
    }
}
