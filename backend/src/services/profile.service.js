import Inquiry from "../models/Inquiry.js";
import Property from "../models/Property.js";
import { landlordResponseTime } from "./notification.service.js";

// Profile fields beyond name and photo, and the public profile other users see.

const text = (value, max) => typeof value === "string" && value.trim().length <= max;
const PHONE_PATTERN = /^\+?[0-9][0-9\s-]{5,19}$/;

function unknownKeys(body, allowed) {
    return Object.keys(body).filter((key) => !allowed.includes(key));
}

function validateObject(value, label) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return `${label} must be an object.`;
    }
    return null;
}

// Validates the profile parts of PATCH /users/me for a user with `role`.
// Returns { updates } as $set paths, or { error }.
export function validateProfileFields(body, role) {
    const updates = {};

    if (body.bio !== undefined) {
        if (!text(body.bio, 500)) return { error: "bio must be at most 500 characters." };
        updates["profile.bio"] = body.bio.trim();
    }

    if (body.renterProfile !== undefined) {
        if (role !== "renter") return { error: "renterProfile is only for renter accounts." };
        const value = body.renterProfile;
        const invalid = validateObject(value, "renterProfile");
        if (invalid) return { error: invalid };
        const extra = unknownKeys(value, ["occupation", "currentAddress", "householdSize", "emergencyContact"]);
        if (extra.length) return { error: `Unsupported renterProfile fields: ${extra.join(", ")}` };
        if (value.occupation !== undefined) {
            if (!text(value.occupation, 100)) return { error: "occupation must be at most 100 characters." };
            updates["profile.renter.occupation"] = value.occupation.trim();
        }
        if (value.currentAddress !== undefined) {
            if (!text(value.currentAddress, 300)) return { error: "currentAddress must be at most 300 characters." };
            updates["profile.renter.currentAddress"] = value.currentAddress.trim();
        }
        if (value.householdSize !== undefined) {
            if (value.householdSize !== null && (!Number.isInteger(value.householdSize) || value.householdSize < 1 || value.householdSize > 20)) {
                return { error: "householdSize must be a whole number from 1 to 20." };
            }
            updates["profile.renter.householdSize"] = value.householdSize;
        }
        if (value.emergencyContact !== undefined) {
            const contact = value.emergencyContact;
            const invalidContact = validateObject(contact, "emergencyContact");
            if (invalidContact) return { error: invalidContact };
            const extraContact = unknownKeys(contact, ["name", "relationship", "phone"]);
            if (extraContact.length) return { error: `Unsupported emergencyContact fields: ${extraContact.join(", ")}` };
            const name = contact.name ?? "";
            const relationship = contact.relationship ?? "";
            const phone = contact.phone ?? "";
            if (!text(name, 100) || !text(relationship, 50) || !text(phone, 20)) {
                return { error: "Emergency contact name, relationship and phone must be short text." };
            }
            if (phone.trim() && !PHONE_PATTERN.test(phone.trim())) {
                return { error: "Enter a valid emergency contact phone number." };
            }
            if ((name.trim() || phone.trim()) && !(name.trim() && phone.trim())) {
                return { error: "An emergency contact needs both a name and a phone number." };
            }
            updates["profile.renter.emergencyContact"] = {
                name: name.trim(),
                relationship: relationship.trim(),
                phone: phone.trim(),
            };
        }
    }

    if (body.landlordProfile !== undefined) {
        if (role !== "landlord") return { error: "landlordProfile is only for landlord accounts." };
        const value = body.landlordProfile;
        const invalid = validateObject(value, "landlordProfile");
        if (invalid) return { error: invalid };
        const extra = unknownKeys(value, ["contactAddress", "contactHours"]);
        if (extra.length) return { error: `Unsupported landlordProfile fields: ${extra.join(", ")}` };
        if (value.contactAddress !== undefined) {
            if (!text(value.contactAddress, 300)) return { error: "contactAddress must be at most 300 characters." };
            updates["profile.landlord.contactAddress"] = value.contactAddress.trim();
        }
        if (value.contactHours !== undefined) {
            if (!text(value.contactHours, 100)) return { error: "contactHours must be at most 100 characters, e.g. \"Weekdays 10am-6pm\"." };
            updates["profile.landlord.contactHours"] = value.contactHours.trim();
        }
    }

    if (body.reviewerProfile !== undefined) {
        if (role !== "legal_reviewer") return { error: "reviewerProfile is only for legal reviewer accounts." };
        const value = body.reviewerProfile;
        const invalid = validateObject(value, "reviewerProfile");
        if (invalid) return { error: invalid };
        const extra = unknownKeys(value, ["barEnrolmentNumber", "jurisdictions", "expertise", "qualifications"]);
        if (extra.length) return { error: `Unsupported reviewerProfile fields: ${extra.join(", ")}` };
        if (value.barEnrolmentNumber !== undefined) {
            if (!text(value.barEnrolmentNumber, 50) || (value.barEnrolmentNumber.trim() && !/^[A-Za-z0-9/.\- ]{2,50}$/.test(value.barEnrolmentNumber.trim()))) {
                return { error: "barEnrolmentNumber must be 2 to 50 letters, digits, spaces, dots, dashes or slashes." };
            }
            updates["profile.reviewer.barEnrolmentNumber"] = value.barEnrolmentNumber.trim();
        }
        if (value.jurisdictions !== undefined) {
            if (!Array.isArray(value.jurisdictions) || value.jurisdictions.length > 10 || !value.jurisdictions.every((item) => text(item, 100) && item.trim())) {
                return { error: "jurisdictions must list up to 10 names." };
            }
            updates["profile.reviewer.jurisdictions"] = [...new Set(value.jurisdictions.map((item) => item.trim()))];
        }
        if (value.expertise !== undefined) {
            if (!text(value.expertise, 300)) return { error: "expertise must be at most 300 characters." };
            updates["profile.reviewer.expertise"] = value.expertise.trim();
        }
        if (value.qualifications !== undefined) {
            const { qualifications, error } = normalizeQualifications(value.qualifications);
            if (error) return { error };
            updates["profile.reviewer.qualifications"] = qualifications;
        }
    }

    if (body.privacy !== undefined) {
        const invalid = validateObject(body.privacy, "privacy");
        if (invalid) return { error: invalid };
        const extra = unknownKeys(body.privacy, ["showPhoto", "showBadges", "showBio"]);
        if (extra.length) return { error: `Unsupported privacy fields: ${extra.join(", ")}` };
        for (const [key, flag] of Object.entries(body.privacy)) {
            if (typeof flag !== "boolean") return { error: `privacy.${key} must be true or false.` };
            updates[`privacy.${key}`] = flag;
        }
    }

    if (body.syncPhotoWithGoogle !== undefined && typeof body.syncPhotoWithGoogle !== "boolean") {
        return { error: "syncPhotoWithGoogle must be true or false." };
    }

    return { updates };
}

// --- Public profile -------------------------------------------------------------

export function publicBadges(user, ownership = null) {
    const verification = user.verification ?? {};
    const badges = [];
    if (verification.email?.verified) badges.push({ type: "email", label: "Email verified", verifiedAt: verification.email.verifiedAt ?? null });
    if (verification.phone?.verified) badges.push({ type: "phone", label: "Phone verified", verifiedAt: verification.phone.verifiedAt ?? null });
    if (verification.identity?.status === "verified") {
        badges.push({ type: "identity", label: "Identity verified", verifiedAt: verification.identity.verifiedAt ?? null });
    }
    if (user.role === "legal_reviewer" && verification.credential?.status === "verified") {
        badges.push({ type: "credential", label: "Credentials verified", verifiedAt: verification.credential.verifiedAt ?? null });
    }
    if (ownership?.count) {
        badges.push({
            type: "ownership",
            label: `Ownership verified for ${ownership.count} listing${ownership.count === 1 ? "" : "s"}`,
            verifiedAt: ownership.latestVerifiedAt ?? null,
        });
    }
    return badges;
}

// Share of the landlord's inquiries in the last 90 days that got a reply.
export function responseRate(inquiries) {
    if (inquiries.length < 3) return null;
    const replied = inquiries.filter((inquiry) => inquiry.firstLandlordReplyAt || inquiry.respondedAt).length;
    return Math.round((replied / inquiries.length) * 100);
}

export async function landlordPublicStats(landlordId, deps = {}) {
    const PropertyModel = deps.PropertyModel ?? Property;
    const InquiryModel = deps.InquiryModel ?? Inquiry;
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const [activeListings, verified, inquiries, typicalResponseTime] = await Promise.all([
        PropertyModel.countDocuments({ landlord: landlordId, status: "published" }),
        PropertyModel.find({
            landlord: landlordId,
            status: "published",
            "ownershipVerification.status": "verified",
        })
            .select("ownershipVerification.verifiedAt")
            .lean(),
        InquiryModel.find({ landlord: landlordId, createdAt: { $gte: since } })
            .select("firstLandlordReplyAt respondedAt")
            .limit(500)
            .lean(),
        landlordResponseTime(landlordId, InquiryModel),
    ]);
    const latestVerifiedAt = verified
        .map((property) => property.ownershipVerification?.verifiedAt)
        .filter(Boolean)
        .sort((a, b) => new Date(b) - new Date(a))[0] ?? null;
    return {
        activeListings,
        ownership: { count: verified.length, latestVerifiedAt },
        responseRate: responseRate(inquiries),
        typicalResponseTime,
    };
}

// The landlord's own view: how quickly and how often they answer inquiries
// (last 90 days), and what's still waiting. Renters see the same rate and
// typical time on the public profile.
export async function landlordResponsiveness(landlordId, deps = {}) {
    const InquiryModel = deps.InquiryModel ?? Inquiry;
    const now = deps.now ?? new Date();
    const since = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const [inquiries, typicalResponseTime] = await Promise.all([
        InquiryModel.find({ landlord: landlordId, createdAt: { $gte: since } })
            .select("createdAt firstLandlordReplyAt respondedAt status")
            .limit(1000)
            .lean(),
        landlordResponseTime(landlordId, InquiryModel),
    ]);
    const replyMinutes = (inquiry) => {
        const repliedAt = inquiry.firstLandlordReplyAt ?? inquiry.respondedAt;
        return repliedAt ? (new Date(repliedAt) - new Date(inquiry.createdAt)) / 60_000 : null;
    };
    const answered = inquiries.filter((inquiry) => replyMinutes(inquiry) !== null);
    const waiting = inquiries.filter(
        (inquiry) => replyMinutes(inquiry) === null && !["closed", "declined"].includes(inquiry.status)
    );
    const within24h = answered.filter((inquiry) => replyMinutes(inquiry) <= 24 * 60).length;
    return {
        periodDays: 90,
        inquiries: inquiries.length,
        answered: answered.length,
        waiting: waiting.length,
        overdue: waiting.filter((inquiry) => now - new Date(inquiry.createdAt) > 24 * 60 * 60 * 1000).length,
        responseRate: responseRate(inquiries),
        answeredWithin24hRate: answered.length >= 3 ? Math.round((within24h / answered.length) * 100) : null,
        typicalResponseTime,
        // Shown to renters on listings and the public profile.
        shownPublicly: true,
    };
}

// What any visitor may see. Never contact details, addresses, identity data
// or date of birth.
export function buildPublicProfile(user, landlordStats = null) {
    const privacy = user.privacy ?? {};
    const profile = {
        id: user._id,
        displayName: user.displayName,
        role: user.role,
        photoURL: privacy.showPhoto === false ? null : user.photoURL ?? null,
        bio: privacy.showBio === false ? "" : user.profile?.bio ?? "",
        memberSince: user.createdAt ?? null,
        badges: privacy.showBadges === false ? [] : publicBadges(user, landlordStats?.ownership),
    };
    if (user.role === "landlord" && landlordStats) {
        profile.landlord = {
            activeListings: landlordStats.activeListings,
            responseRate: landlordStats.responseRate,
            typicalResponseTime: landlordStats.typicalResponseTime,
            contactHours: user.profile?.landlord?.contactHours || null,
        };
    }
    if (user.role === "legal_reviewer") {
        profile.reviewer = {
            jurisdictions: user.profile?.reviewer?.jurisdictions ?? [],
            expertise: user.profile?.reviewer?.expertise ?? "",
            qualifications: user.profile?.reviewer?.qualifications ?? [],
        };
    }
    return profile;
}

// Reviewer qualifications: up to 10 entries of { title, institution?, year? }.
export function normalizeQualifications(input) {
    const error = "qualifications must list up to 10 entries, each with a title (max 150 characters), an optional institution (max 150) and an optional year.";
    if (!Array.isArray(input) || input.length > 10) return { error };
    const currentYear = new Date().getFullYear();
    const qualifications = [];
    for (const item of input) {
        if (!item || typeof item !== "object" || Array.isArray(item)) return { error };
        const extra = Object.keys(item).filter((key) => !["title", "institution", "year"].includes(key));
        if (extra.length) return { error: `Unsupported qualification fields: ${extra.join(", ")}` };
        if (typeof item.title !== "string" || !item.title.trim() || item.title.length > 150) return { error };
        if (item.institution !== undefined && (typeof item.institution !== "string" || item.institution.length > 150)) return { error };
        if (item.year !== undefined && item.year !== null && (!Number.isInteger(item.year) || item.year < 1950 || item.year > currentYear)) {
            return { error: `Qualification year must be a whole year from 1950 to ${currentYear}.` };
        }
        qualifications.push({
            title: item.title.trim(),
            institution: item.institution?.trim() ?? "",
            year: item.year ?? null,
        });
    }
    return { qualifications };
}
