import { randomUUID } from "node:crypto";

import { currentPolicyValues, policyValues } from "./platformSettings.service.js";
import Inquiry from "../models/Inquiry.js";
import Notification from "../models/Notification.js";
import NotificationDelivery from "../models/NotificationDelivery.js";
import Property from "../models/Property.js";
import RenterPreference from "../models/RenterPreference.js";
import SavedProperty from "../models/SavedProperty.js";
import SavedSearch from "../models/SavedSearch.js";
import CopilotConversation from "../models/CopilotConversation.js";
import TenancyAgreement from "../models/TenancyAgreement.js";
import UploadedFile from "../models/UploadedFile.js";
import User from "../models/User.js";
import UserSession from "../models/UserSession.js";
import VerificationRequest from "../models/VerificationRequest.js";
import ViewingRequest from "../models/ViewingRequest.js";
import { createNotification } from "./notification.service.js";

// Account deletion. The user record is kept but anonymised so shared records
// (inquiries, reviews, tenancy agreements, evidence) still make sense to the
// other people in them; everything that is only the user's own is removed.

export const DELETION_CONFIRMATION = "DELETE MY ACCOUNT";
const DAY_MS = 24 * 60 * 60 * 1000;
const MEDIA_PURPOSES = ["profile_photo", "property_image", "property_video", "floor_plan"];

export function deletionRules() {
    const policies = policyValues();
    const days = policies.accountDeletionFileRetentionDays;
    const verificationDays = policies.verificationDocumentRetentionDays;
    return {
        removedNow: [
            "Your name, email, phone number, photo, bio and profile details (replaced with \"Deleted user\")",
            "Your verified ID number and date of birth",
            "Saved properties, saved searches, preferences, recently viewed and notifications",
            "Your listings (removed from search) and their open viewings and inquiries",
            "Your sign-in sessions and devices; you are signed out everywhere",
        ],
        removedLater: [
            `Your profile photo and listing photos, videos and floor plans after ${days} days`,
            `Identity and ownership documents ${verificationDays} days after their review closed`,
        ],
        kept: [
            "Messages, reviews and inquiries you sent, shown as from \"Deleted user\", so the other person keeps their history",
            "Tenancy agreements, condition reports, maintenance requests and evidence shared with another party, until their retention period ends or a legal hold is lifted",
            "Audit and security logs, which record what happened without your profile details",
        ],
        cannotUndo: "Deleting your account can't be undone. Download your data first if you want a copy.",
    };
}

export async function deletionPreview(user, deps = {}) {
    const PropertyModel = deps.PropertyModel ?? Property;
    const AgreementModel = deps.AgreementModel ?? TenancyAgreement;
    const ViewingModel = deps.ViewingModel ?? ViewingRequest;
    const [listings, publishedListings, openAgreements, openViewings] = await Promise.all([
        PropertyModel.countDocuments({ landlord: user._id }),
        PropertyModel.countDocuments({ landlord: user._id, status: "published" }),
        AgreementModel.countDocuments({
            $or: [{ renter: user._id }, { landlord: user._id }],
            status: { $ne: "archived" },
        }),
        ViewingModel.countDocuments({
            $or: [{ renter: user._id }, { landlord: user._id }],
            status: { $in: ["requested", "confirmed"] },
        }),
    ]);
    return {
        allowed: user.role !== "admin",
        blockedReason: user.role === "admin" ? "Admin accounts are removed by another admin." : null,
        confirmation: DELETION_CONFIRMATION,
        counts: { listings, publishedListings, openAgreements, openViewings },
        rules: deletionRules(),
    };
}

async function closeListings(user, now) {
    // Already-deleted listings too, so their media is released as well.
    const properties = await Property.find({ landlord: user._id })
        .setOptions({ includeDeleted: true })
        .select("_id title images videos floorPlans status")
        .lean();
    if (!properties.length) return { listings: 0, viewings: 0 };
    const ids = properties.map((property) => property._id);

    const viewings = await ViewingRequest.find({
        property: { $in: ids },
        status: { $in: ["requested", "confirmed"] },
    })
        .select("_id renter property")
        .lean();
    await ViewingRequest.updateMany(
        { _id: { $in: viewings.map((viewing) => viewing._id) } },
        { $set: { status: "cancelled", cancelledBy: "landlord", cancellationReason: "The landlord's account was deleted." } }
    );
    const titles = new Map(properties.map((property) => [String(property._id), property.title]));
    await Promise.allSettled(viewings.map((viewing) => createNotification({
        recipient: viewing.renter,
        type: "viewing_request_cancelled",
        title: "Viewing cancelled",
        message: `"${titles.get(String(viewing.property)) ?? "The property"}" is no longer listed, so your viewing was cancelled.`,
        link: "/viewings",
        relatedProperty: viewing.property,
        relatedViewingRequest: viewing._id,
    })));

    await Promise.all([
        Inquiry.updateMany(
            { property: { $in: ids }, status: { $in: ["pending", "submitted", "acknowledged"] } },
            { $set: { status: "closed" } }
        ),
        SavedProperty.deleteMany({ property: { $in: ids } }),
        User.updateMany({ favorites: { $in: ids } }, { $pull: { favorites: { $in: ids } } }),
        // Kept (hidden) for inquiry and review history, without media.
        Property.updateMany(
            { _id: { $in: ids } },
            { $set: { status: "deleted", deletedAt: now, images: [], videos: [], floorPlans: [] } },
            { includeDeleted: true }
        ),
    ]);
    return { listings: properties.filter((property) => property.status !== "deleted").length, viewings: viewings.length };
}

async function closeRenterActivity(user) {
    const viewings = await ViewingRequest.find({
        renter: user._id,
        status: { $in: ["requested", "confirmed"] },
    })
        .select("_id landlord property")
        .lean();
    await ViewingRequest.updateMany(
        { _id: { $in: viewings.map((viewing) => viewing._id) } },
        { $set: { status: "cancelled", cancelledBy: "renter", cancellationReason: "The renter's account was deleted." } }
    );
    await Promise.allSettled(viewings.map((viewing) => createNotification({
        recipient: viewing.landlord,
        type: "viewing_request_cancelled",
        title: "Viewing cancelled",
        message: "A renter deleted their Neve account, so their viewing was cancelled.",
        link: "/listings/viewings",
        relatedProperty: viewing.property,
        relatedViewingRequest: viewing._id,
    })));
    await Inquiry.updateMany(
        { renter: user._id, status: { $in: ["pending", "submitted", "acknowledged"] } },
        { $set: { status: "closed" } }
    );
    return viewings.length;
}

// Deletes the account. Returns a summary; throws for admins.
export async function deleteAccount(user, deps = {}) {
    const now = deps.now ?? new Date();
    if (user.role === "admin") {
        throw Object.assign(new Error("Admin accounts are removed by another admin."), { status: 403 });
    }

    const listings = await closeListings(user, now);
    const renterViewings = await closeRenterActivity(user);

    await VerificationRequest.updateMany(
        { user: user._id, status: "pending" },
        { $set: { status: "cancelled", reviewNote: "Cancelled because the account was deleted." } }
    );

    // Photos and listing media are deleted by the retention purge later.
    const retentionUntil = new Date(now.getTime() + (await currentPolicyValues()).accountDeletionFileRetentionDays * DAY_MS);
    const media = await UploadedFile.updateMany(
        { uploadedBy: user._id, purpose: { $in: MEDIA_PURPOSES }, status: "uploaded", legalHold: false },
        { $set: { retentionUntil } }
    );

    await Promise.all([
        SavedProperty.deleteMany({ renter: user._id }),
        SavedSearch.deleteMany({ renter: user._id }),
        CopilotConversation.deleteMany({ owner: user._id }),
        RenterPreference.deleteMany({ renter: user._id }),
        Notification.deleteMany({ recipient: user._id }),
        NotificationDelivery.deleteMany({ recipient: user._id, status: { $in: ["pending", "sending", "dead"] } }),
        UserSession.deleteMany({ user: user._id }),
    ]);

    // Anonymise. The raw collection update replaces firebaseUid, which the
    // schema marks immutable, so the old sign-in can never map back to it.
    const firebaseUid = user.firebaseUid;
    await User.collection.updateOne(
        { _id: user._id },
        {
            $set: {
                firebaseUid: `deleted:${randomUUID()}`,
                displayName: "Deleted user",
                email: null,
                phoneNumber: null,
                photoURL: null,
                profilePhoto: null,
                photoSource: null,
                photoSyncWithGoogle: false,
                googlePhotoURL: null,
                favorites: [],
                recentlyViewed: [],
                passwordHash: null,
                isActive: false,
                deletedAt: now,
                notificationPreferences: { email: false, digest: "off", mutedTypes: [], emailMutedTypes: [] },
                verification: {
                    email: { verified: false, verifiedAt: null },
                    phone: { verified: false, phoneNumber: null, verifiedAt: null, method: null },
                    identity: { status: "unverified", verifiedAt: null },
                    credential: { status: "unverified", verifiedAt: null },
                },
                updatedAt: now,
            },
            $unset: { profile: "", privacy: "", identity: "", security: "" },
        }
    );

    // Remove the sign-in account too, so the old login no longer works.
    let signInRemoved = false;
    if (firebaseUid && !firebaseUid.startsWith("neve-admin:")) {
        try {
            const deleteFirebaseUser = deps.deleteFirebaseUser ?? (async (uid) => {
                const { firebaseAuth } = await import("../config/firebase.js");
                await firebaseAuth.deleteUser(uid);
            });
            await deleteFirebaseUser(firebaseUid);
            signInRemoved = true;
        } catch (error) {
            if (error?.code === "auth/user-not-found") {
                signInRemoved = true;
            } else {
                console.error("Delete Firebase user error:", error.code ?? error.message);
            }
        }
    }

    return {
        deletedAt: now,
        listingsRemoved: listings.listings,
        viewingsCancelled: listings.viewings + renterViewings,
        filesScheduledForDeletion: media.modifiedCount ?? 0,
        filesDeletedAfter: retentionUntil,
        signInRemoved,
    };
}
