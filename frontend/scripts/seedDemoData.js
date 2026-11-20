// Prepares the local test accounts for a demonstration: creates their Neve
// profiles, gives the landlord six of the seeded listings, and fills in the
// renter's activity (saved homes, saved searches, inquiries with replies,
// viewing requests, notifications and a review). All people and messages are
// invented.
//
// Run `npm run seed-listings -- --confirm` first. Then:
//   npm run seed-demo-data -- --dry-run
//   npm run seed-demo-data -- --confirm
//   npm run seed-demo-data -- --confirm --reset    (replaces earlier demo activity)
//   npm run seed-demo-data -- --renter you@gmail.com --keep-profile --confirm
//       attaches the demo activity to a real account without changing its name or details
//
// The three accounts must already exist in Firebase (see secrets/local-accounts.txt).
// This script looks up their IDs by email and never touches passwords.
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

import Inquiry from "../src/server/models/Inquiry.js";
import InquiryMessage from "../src/server/models/InquiryMessage.js";
import Notification from "../src/server/models/Notification.js";
import Property from "../src/server/models/Property.js";
import RenterPreference from "../src/server/models/RenterPreference.js";
import Review from "../src/server/models/Review.js";
import SavedProperty from "../src/server/models/SavedProperty.js";
import SavedSearch from "../src/server/models/SavedSearch.js";
import UploadedFile from "../src/server/models/UploadedFile.js";
import User from "../src/server/models/User.js";
import ViewingRequest from "../src/server/models/ViewingRequest.js";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const valueOf = (name, fallback) => {
    const index = args.indexOf(`--${name}`);
    return index === -1 ? fallback : args[index + 1]?.trim().toLowerCase();
};

const EMAILS = {
    renter: valueOf("renter", "neve-local-renter@example.com"),
    landlord: valueOf("landlord", "neve-local-landlord@example.com"),
    reviewer: valueOf("reviewer", "neve-local-reviewer@example.com"),
};

// Listings handed to the demo landlord (matched by title text).
const LANDLORD_LISTINGS = ["Dhanmondi Lake", "Lalmatia Block D", "Uttara Sector 7", "Gulshan 2", "Banani near Road 11", "Mirpur DOHS"];
// Listings the renter saves.
const SAVED_LISTINGS = ["Dhanmondi Lake", "Lalmatia Block D", "Bashundhara R/A", "GEC Circle"];

const PEOPLE = {
    renter: { displayName: "Tasnim Rahman", phoneNumber: "+8801712345601", bio: "Software engineer relocating to Dhaka, looking for a quiet 2 or 3 bedroom flat.", renter: { occupation: "Software engineer", currentAddress: "Chattogram", householdSize: 2 } },
    landlord: { displayName: "Imran Hossain", phoneNumber: "+8801712345602", bio: "Owns six flats in Dhaka and replies to inquiries within a day.", landlord: { contactAddress: "Dhanmondi, Dhaka", contactHours: "10am to 8pm, Saturday to Thursday" } },
    reviewer: { displayName: "Sabrina Haque", phoneNumber: "+8801712345603", bio: "Advocate reviewing legal sources for Neve.", reviewer: { barEnrolmentNumber: "DBA-2014-04821", jurisdictions: ["Dhaka"], expertise: "Landlord and tenant law, property transfer", qualifications: [{ title: "LL.B. (Hons)", institution: "University of Dhaka", year: 2012 }] } },
};

const daysFromNow = (days, hour = 11) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    d.setUTCHours(hour, 0, 0, 0);
    return d;
};

// Builds every activity document (unsaved) for the given users and listings.
export function buildActivity({ renter, landlord, listings, saved }) {
    const byKey = (key) => listings.find((p) => p.title.includes(key));
    const [lake, lalmatia, uttara, gulshan] = ["Dhanmondi Lake", "Lalmatia Block D", "Uttara Sector 7", "Gulshan 2"].map(byKey);

    const inquiries = [
        { property: lake, message: "Hello, is the flat still available from 1 December? We are two adults and would like to see it this week.", status: "responded", landlordResponse: "Yes, it is available from 1 December. You are welcome to visit on Thursday afternoon.", respondedAt: daysFromNow(-2, 9), firstLandlordReplyAt: daysFromNow(-2, 9) },
        { property: lalmatia, message: "Could you tell me if the air conditioners are included in the rent and whether the lease can be 6 months?", status: "pending" },
        { property: uttara, message: "Is there parking for one car, and is the building near a bus stop?", status: "closed", landlordResponse: "One car space is included. The Sector 7 bus stop is a five minute walk.", respondedAt: daysFromNow(-9, 10), firstLandlordReplyAt: daysFromNow(-9, 10) },
    ].map((item) => new Inquiry({ ...item, property: item.property._id, renter: renter._id, landlord: landlord._id }));

    const messages = [
        new InquiryMessage({ inquiry: inquiries[0]._id, sender: landlord._id, recipient: renter._id, body: "Yes, it is available from 1 December. You are welcome to visit on Thursday afternoon.", readAt: daysFromNow(-2, 10) }),
        new InquiryMessage({ inquiry: inquiries[0]._id, sender: renter._id, recipient: landlord._id, body: "Thursday at 4pm works for us. Could you also confirm the service charge is included in the 55,000?", readAt: daysFromNow(-1, 8) }),
        new InquiryMessage({ inquiry: inquiries[0]._id, sender: landlord._id, recipient: renter._id, body: "The 3,500 service charge is separate and paid monthly with the rent. Gas and water are included." }),
    ];

    const viewings = [
        new ViewingRequest({ property: lake._id, renter: renter._id, landlord: landlord._id, requestedDate: daysFromNow(3, 10), message: "We would like to see the flat on Thursday afternoon.", status: "confirmed", landlordNote: "Confirmed. Please ring the bell for the fifth floor." }),
        new ViewingRequest({ property: gulshan._id, renter: renter._id, landlord: landlord._id, requestedDate: daysFromNow(6, 12), message: "Is Saturday noon possible?", status: "requested" }),
        new ViewingRequest({ property: uttara._id, renter: renter._id, landlord: landlord._id, requestedDate: daysFromNow(-7, 11), message: "Viewing the Sector 7 flat.", status: "completed", completedAt: daysFromNow(-7, 12) }),
    ];

    const savedProperties = saved.map((property) => new SavedProperty({ renter: renter._id, property: property._id }));

    const searches = [
        new SavedSearch({ renter: renter._id, slot: 1, name: "2-3 bed flats in Dhaka under 50k", city: "Dhaka", propertyType: "apartment", maxRent: 50000, minBedrooms: 2, alertsEnabled: true }),
        new SavedSearch({ renter: renter._id, slot: 2, name: "Furnished homes in Chattogram", city: "Chattogram", furnishing: "furnished", maxRent: 45000, alertsEnabled: false }),
    ];

    const preference = new RenterPreference({ renter: renter._id, cities: ["Dhaka"], areas: ["Dhanmondi", "Lalmatia", "Mohammadpur"], minRent: 25000, maxRent: 55000, bedrooms: [2, 3], propertyTypes: ["apartment"], alertsEnabled: true });

    const review = new Review({ property: uttara._id, renter: renter._id, rating: 4, comment: "Clean building and an honest description. The photos matched the flat and the landlord was easy to reach. The lift was out of service for one day during our visit." });

    const note = (recipient, type, title, message) => new Notification({ recipient: recipient._id, type, title, message });
    const notifications = [
        note(renter, "inquiry_replied", "Imran Hossain replied", "Your inquiry about the Dhanmondi Lake flat has a reply."),
        note(renter, "viewing_request_confirmed", "Viewing confirmed", "Your viewing of the Dhanmondi Lake flat is confirmed for Thursday."),
        note(renter, "matching_listing_available", "New home matches your search", "A 3-bedroom flat in Bashundhara R/A fits 2-3 bed flats in Dhaka under 50k."),
        note(landlord, "inquiry_received", "New inquiry", `${renter.displayName} asked about the Lalmatia Block D flat.`),
        note(landlord, "viewing_request_received", "New viewing request", `${renter.displayName} requested a viewing of the Gulshan 2 flat.`),
    ];

    return { inquiries, messages, viewings, savedProperties, searches, preference, review, notifications };
}

async function lookupFirebase() {
    const { getFirebaseAuth } = await import("../src/server/config/firebase.js");
    const auth = getFirebaseAuth();
    const found = {};
    for (const [role, email] of Object.entries(EMAILS)) {
        try {
            found[role] = await auth.getUserByEmail(email);
        } catch (error) {
            throw new Error(`No Firebase account for ${email} (${error.code ?? error.message}).`);
        }
    }
    return found;
}

async function main() {
    const { connectDatabase } = await import("../src/server/config/database.js");
    await connectDatabase();

    const listings = await Property.find({ status: "published" }).select("title landlord");
    if (listings.length < 20) throw new Error("Run `npm run seed-listings -- --confirm` first.");
    const pick = (keys) => keys.map((key) => {
        const hit = listings.find((p) => p.title.includes(key));
        if (!hit) throw new Error(`No listing found for "${key}".`);
        return hit;
    });
    const mine = pick(LANDLORD_LISTINGS);
    const saved = pick(SAVED_LISTINGS);

    const firebase = await lookupFirebase();

    if (flag("dry-run") || !flag("confirm")) {
        // Validate the documents with stand-in users; nothing is written.
        const stub = (role) => new User({ firebaseUid: `stub-${role}`, displayName: PEOPLE[role].displayName, role });
        const activity = buildActivity({ renter: stub("renter"), landlord: stub("landlord"), listings, saved });
        const docs = Object.values(activity).flat();
        for (const doc of docs) await doc.validate();
        console.log(`Found ${Object.keys(firebase).length} Firebase accounts; ${docs.length} activity records are valid. Dry run only. Add --confirm to write.`);
        return;
    }

    // Profiles for the three accounts.
    const users = {};
    for (const role of ["renter", "landlord", "reviewer"]) {
        const { uid, email, photoURL } = firebase[role];
        const person = PEOPLE[role];
        const profile = { bio: person.bio, ...(person.renter && { renter: person.renter }), ...(person.landlord && { landlord: person.landlord }), ...(person.reviewer && { reviewer: person.reviewer }) };
        const fields = { email, displayName: person.displayName, phoneNumber: person.phoneNumber, photoURL: photoURL ?? null, role: role === "reviewer" ? "legal_reviewer" : role, profile, isActive: true };
        // --keep-profile: a real account keeps its own name and details; the profile above is used only if it has none yet.
        const update = flag("keep-profile") ? { $setOnInsert: fields } : { $set: fields };
        users[role] = await User.findOneAndUpdate({ firebaseUid: uid }, update, { upsert: true, new: true, setDefaultsOnInsert: true });
    }
    const ids = [users.renter._id, users.landlord._id];

    if (flag("reset")) {
        const old = await Inquiry.find({ renter: users.renter._id }).select("_id");
        await InquiryMessage.deleteMany({ inquiry: { $in: old.map((i) => i._id) } });
        await Promise.all([
            Inquiry.deleteMany({ renter: users.renter._id }),
            ViewingRequest.deleteMany({ renter: users.renter._id }),
            SavedProperty.deleteMany({ renter: users.renter._id }),
            SavedSearch.deleteMany({ renter: users.renter._id }),
            RenterPreference.deleteMany({ renter: users.renter._id }),
            Review.deleteMany({ renter: users.renter._id }),
            Notification.deleteMany({ recipient: { $in: ids } }),
        ]);
    }

    // Hand six listings and their photos to the demo landlord.
    const mineIds = mine.map((p) => p._id);
    await Property.updateMany({ _id: { $in: mineIds } }, { $set: { landlord: users.landlord._id } });
    await UploadedFile.updateMany({ property: { $in: mineIds }, purpose: "property_image" }, { $set: { uploadedBy: users.landlord._id } });

    const activity = buildActivity({ renter: users.renter, landlord: users.landlord, listings: mine.concat(saved.filter((p) => !mine.includes(p))), saved });
    const { notifications, ...records } = activity;
    for (const doc of Object.values(records).flat()) await doc.save();
    // Inserted directly: saving a Notification also queues an email, and demo notifications must not send any.
    await Notification.collection.insertMany(notifications.map((doc) => doc.toObject()));
    console.log(`Done. Renter ${EMAILS.renter}, landlord ${EMAILS.landlord}, reviewer ${EMAILS.reviewer}: profiles created; landlord owns ${mine.length} listings; renter has ${activity.savedProperties.length} saved homes, ${activity.inquiries.length} inquiries, ${activity.viewings.length} viewings, ${activity.searches.length} saved searches.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main()
        .catch((error) => {
            console.error(error.message);
            process.exitCode = 1;
        })
        .finally(async () => {
            await mongoose.disconnect().catch(() => {});
        });
}
