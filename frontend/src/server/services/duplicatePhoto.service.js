import ListingWarning from "../models/ListingWarning.js";
import Property from "../models/Property.js";
import UploadedFile from "../models/UploadedFile.js";
import { readStoredObject } from "./fileUpload.service.js";
import { DUPLICATE_DISTANCE, computePerceptualHash, hammingDistance } from "./imageHash.service.js";
import { notifyListingFlagged } from "./notificationEvents.service.js";

// Flags listing photos that look the same as photos in another landlord's
// listing. A flag is a signal for an admin to review, never a verdict.

export const DUPLICATE_PHOTO_MESSAGE =
    "One or more photos look the same as photos in another landlord's listing.";

// Computes and stores the hash of an uploaded listing photo. Never throws:
// a photo that can't be decoded just has no hash.
export async function hashListingPhoto(file, deps = {}) {
    try {
        const bytes = await (deps.readStoredObject ?? readStoredObject)(file.storageKey);
        const hash = await (deps.computePerceptualHash ?? computePerceptualHash)(bytes);
        file.perceptualHash = hash;
        return hash;
    } catch (error) {
        console.error("Photo hash error:", error.message ?? error);
        return null;
    }
}

// Photos of `property` that match photos on other landlords' listings.
export async function findDuplicatePhotos(property, deps = {}) {
    const Files = deps.UploadedFileModel ?? UploadedFile;
    const Properties = deps.PropertyModel ?? Property;
    const ownIds = (property.images ?? []).map(String);
    if (!ownIds.length) return [];

    const own = await Files.find({ _id: { $in: ownIds }, perceptualHash: { $ne: null } })
        .select("perceptualHash")
        .lean();
    if (!own.length) return [];

    // Every other hashed listing photo. 64-bit hashes can't be searched by
    // distance in the database, so this scans them (fine for tens of
    // thousands of photos).
    const others = await Files.find({
        purpose: "property_image",
        status: "uploaded",
        perceptualHash: { $ne: null },
        _id: { $nin: ownIds },
    })
        .select("perceptualHash")
        .lean();

    const candidates = [];
    for (const photo of own) {
        for (const other of others) {
            const distance = hammingDistance(photo.perceptualHash, other.perceptualHash);
            if (distance <= DUPLICATE_DISTANCE) {
                candidates.push({ photo: photo._id, otherPhoto: other._id, distance });
            }
        }
    }
    if (!candidates.length) return [];

    // Only photos used on another landlord's live listing count.
    const listings = await Properties.find({
        images: { $in: candidates.map((match) => match.otherPhoto) },
        landlord: { $ne: property.landlord },
        status: { $in: ["published", "paused"] },
    })
        .select("_id title landlord images")
        .lean();
    const listingByPhoto = new Map();
    for (const listing of listings) {
        for (const image of listing.images ?? []) listingByPhoto.set(String(image), listing);
    }

    return candidates
        .filter((match) => listingByPhoto.has(String(match.otherPhoto)))
        .map((match) => ({
            ...match,
            otherProperty: listingByPhoto.get(String(match.otherPhoto))._id,
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 20);
}

// Records (or refreshes) the open duplicate_photo warning for `property` and
// tells admins about a new one. Returns the warning or null.
export async function checkDuplicatePhotos(property, deps = {}) {
    const Warnings = deps.ListingWarningModel ?? ListingWarning;
    const matches = await findDuplicatePhotos(property, deps);
    if (!matches.length) return null;

    const evidence = {
        structuredValue: {
            matches: matches.map((match) => ({
                photo: String(match.photo),
                otherProperty: String(match.otherProperty),
                otherPhoto: String(match.otherPhoto),
                differingBits: match.distance,
            })),
        },
        descriptionValue: null,
    };
    const result = await Warnings.findOneAndUpdate(
        { property: property._id, type: "duplicate_photo", status: { $in: ["open", "reviewed"] } },
        {
            $set: { severity: "high", message: DUPLICATE_PHOTO_MESSAGE, evidence },
            $setOnInsert: { property: property._id, type: "duplicate_photo", status: "open" },
        },
        { upsert: true, returnDocument: "after", includeResultMetadata: true }
    );
    const warning = result.value;
    const isNew = !result.lastErrorObject?.updatedExisting;
    if (isNew) {
        await (deps.notifyListingFlagged ?? notifyListingFlagged)({
            property,
            warnings: [{ message: DUPLICATE_PHOTO_MESSAGE }],
            actorId: property.landlord,
        });
    }
    return warning;
}

// Hashes listing photos uploaded before hashing existed, then re-checks
// their listings. Run by the photo_hash_backfill job.
export async function backfillPhotoHashes({ limit = 200 } = {}) {
    const files = await UploadedFile.find({
        purpose: "property_image",
        status: "uploaded",
        perceptualHash: null,
        perceptualHashFailed: { $ne: true },
    })
        .limit(limit);
    let hashed = 0;
    const properties = new Set();
    for (const file of files) {
        const hash = await hashListingPhoto(file);
        if (hash) {
            hashed += 1;
            if (file.property) properties.add(String(file.property));
        } else {
            file.perceptualHashFailed = true;
        }
        await file.save();
    }
    let flagged = 0;
    for (const propertyId of properties) {
        const property = await Property.findById(propertyId).select("_id title landlord images status").lean();
        if (property && (await checkDuplicatePhotos(property).catch(() => null))) flagged += 1;
    }
    return { checked: files.length, hashed, listingsFlagged: flagged };
}
