// Fills the database with 20 realistic, published rental listings for demos:
// real Bangladeshi areas, plausible rents in BDT, itemized costs and photos.
// The people and listings are invented. Photos are the five pictures in
// public/images/landing, cropped differently for every listing and uploaded
// to R2 under the "seed/" prefix.
//
//   npm run seed-listings -- --dry-run     (validates everything, writes nothing)
//   npm run seed-listings -- --confirm     (needs MongoDB and R2)
//   npm run seed-listings -- --confirm --reset   (removes an earlier seed first)
//
// Everything this script creates belongs to four landlords whose Firebase UID
// starts with "seed-landlord-", so --reset can remove exactly those records.
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";
import sharp from "sharp";

import Property from "../src/server/models/Property.js";
import UploadedFile from "../src/server/models/UploadedFile.js";
import User from "../src/server/models/User.js";

const UID_PREFIX = "seed-landlord-";
const here = path.dirname(fileURLToPath(import.meta.url));
const PHOTO_DIR = path.join(here, "../public/images/landing");
const PHOTOS = ["home-1.png", "home-4.png", "home-5.png", "home-7.png", "home-8.png"];

const LANDLORDS = [
    { name: "Mahbubul Alam", bio: "Owns several flats in Dhanmondi and Mohammadpur. Replies within a day.", hours: "9am to 8pm, Saturday to Thursday" },
    { name: "Shirin Akter", bio: "Rents out family homes in Uttara and Bashundhara R/A.", hours: "10am to 7pm daily" },
    { name: "Rafiqul Islam Chowdhury", bio: "Landlord in Chattogram, mostly Khulshi and GEC Circle.", hours: "9am to 6pm, Saturday to Thursday" },
    { name: "Nusrat Jahan", bio: "Lists rooms and small flats for students and young professionals.", hours: "11am to 9pm daily" },
];

const util = (utility, billing, monthlyAmount = null) => ({ utility, billing, monthlyAmount, ...(utility === "other" ? { label: "Other" } : {}) });

// landlord: index into LANDLORDS. rent and other money are in BDT per month unless noted.
const LISTINGS = [
    { l: 0, type: "apartment", title: "Bright 3-bedroom flat near Dhanmondi Lake, Road 27", area: "Dhanmondi", city: "Dhaka", ll: [23.7569, 90.3756], bed: 3, bath: 3, sqft: 1650, floor: 5, furn: "unfurnished", rent: 55000, service: 3500, maint: 0,
      amenities: ["Lift", "Generator backup", "Gas line", "Car parking", "24/7 security", "CCTV"], utils: [util("gas", "included"), util("water", "included"), util("electricity", "estimated", 3500), util("internet", "fixed", 1000)],
      desc: "Corner flat on the fifth floor with cross ventilation and a view of the lake. Five minutes on foot from Rabindra Sarobar. Tiled floors, a separate dining area and a servant's room." },
    { l: 0, type: "apartment", title: "Renovated 2-bedroom apartment, Mohammadpur Town Hall", area: "Mohammadpur", city: "Dhaka", ll: [23.7662, 90.3589], bed: 2, bath: 2, sqft: 1050, floor: 3, furn: "unfurnished", rent: 28000, service: 2000, maint: 0,
      amenities: ["Lift", "Gas line", "Generator backup", "Rooftop access"], utils: [util("gas", "fixed", 1000), util("water", "included"), util("electricity", "estimated", 2200)],
      desc: "Freshly painted flat in a quiet lane off Town Hall Road. Close to the market, schools and the Asad Gate bus stop. Suitable for a small family." },
    { l: 0, type: "apartment", title: "Furnished 2-bedroom flat in Lalmatia Block D", area: "Lalmatia", city: "Dhaka", ll: [23.7545, 90.3680], bed: 2, bath: 2, sqft: 1100, floor: 4, furn: "furnished", rent: 42000, service: 2500, maint: 0,
      amenities: ["Furnished", "AC in bedrooms", "Lift", "Generator backup", "Gas line", "Wi-Fi ready"], utils: [util("gas", "included"), util("water", "included"), util("electricity", "estimated", 4000), util("internet", "fixed", 1000)],
      desc: "Move-in ready with beds, wardrobes, a sofa set and air conditioners in both bedrooms. Walking distance from Lalmatia Girls' School and the Sobhanbag bus route." },
    { l: 1, type: "apartment", title: "Spacious 3-bedroom family flat, Uttara Sector 7", area: "Uttara", city: "Dhaka", ll: [23.8759, 90.3795], bed: 3, bath: 3, sqft: 1500, floor: 6, furn: "unfurnished", rent: 38000, service: 3000, maint: 0,
      amenities: ["Lift", "Generator backup", "Gas line", "Car parking", "24/7 security", "Rooftop access"], utils: [util("gas", "fixed", 1000), util("water", "included"), util("electricity", "estimated", 3000)],
      desc: "Open, airy flat in a well-kept building on Road 11. Near the Uttara Metro Rail station, Sector 7 market and several schools. Two balconies facing south." },
    { l: 1, type: "apartment", title: "Modern 3-bedroom apartment in Bashundhara R/A, Block C", area: "Bashundhara R/A", city: "Dhaka", ll: [23.8193, 90.4526], bed: 3, bath: 3, sqft: 1600, floor: 7, furn: "unfurnished", rent: 45000, service: 4000, maint: 0,
      amenities: ["Lift", "Generator backup", "Gas line", "Car parking", "CCTV", "Community hall"], utils: [util("gas", "included"), util("water", "included"), util("electricity", "estimated", 3500), util("internet", "fixed", 1000)],
      desc: "Seventh-floor flat with open views and plenty of daylight. Close to Evercare Hospital, North South University and the Block C mosque. Parking space included." },
    { l: 1, type: "house", title: "Independent 4-bedroom duplex with garden, Uttara Sector 13", area: "Uttara", city: "Dhaka", ll: [23.8627, 90.3892], bed: 4, bath: 4, sqft: 2800, floor: 0, furn: "unfurnished", rent: 85000, service: 0, maint: 5000,
      amenities: ["Private garden", "Car parking", "Generator backup", "Gas line", "Boundary wall", "Rooftop access"], utils: [util("gas", "included"), util("water", "included"), util("electricity", "not_disclosed")],
      desc: "A standalone duplex on a 5-katha plot with a small lawn and a covered car porch. Suitable for a large family or a small office. Quiet street, ten minutes from the airport road." },
    { l: 0, type: "apartment", title: "Premium 3-bedroom flat with balcony, Gulshan 2", area: "Gulshan", city: "Dhaka", ll: [23.7925, 90.4078], bed: 3, bath: 4, sqft: 2100, floor: 8, furn: "unfurnished", rent: 95000, service: 8000, maint: 0,
      amenities: ["Lift", "Generator backup", "Gas line", "Car parking (2)", "24/7 security", "Gym", "CCTV"], utils: [util("gas", "included"), util("water", "included"), util("electricity", "estimated", 6000), util("internet", "fixed", 1000)],
      desc: "High-floor apartment near Gulshan Circle 2 with two large balconies, a master bedroom with a dressing room, and a shared gym on the roof. Two covered parking spaces." },
    { l: 1, type: "apartment", title: "Cozy 2-bedroom flat in Banani near Road 11", area: "Banani", city: "Dhaka", ll: [23.7940, 90.4043], bed: 2, bath: 2, sqft: 1250, floor: 4, furn: "furnished", rent: 60000, service: 5000, maint: 0,
      amenities: ["Furnished", "AC in bedrooms", "Lift", "Generator backup", "Gas line", "Wi-Fi ready"], utils: [util("gas", "included"), util("water", "included"), util("electricity", "estimated", 5000), util("internet", "fixed", 1200)],
      desc: "Fully furnished two-bedroom flat steps from the Banani lake and Road 11 restaurants. A good fit for a couple or two professionals working nearby." },
    { l: 0, type: "apartment", title: "Affordable 2-bedroom flat in Mirpur DOHS", area: "Mirpur", city: "Dhaka", ll: [23.8366, 90.3658], bed: 2, bath: 2, sqft: 1000, floor: 2, furn: "unfurnished", rent: 24000, service: 1500, maint: 0,
      amenities: ["Lift", "Gas line", "Generator backup", "24/7 security"], utils: [util("gas", "fixed", 1000), util("water", "included"), util("electricity", "estimated", 2000)],
      desc: "Compact, well-planned flat inside the DOHS gate. Near Mirpur 12 bus stop and the metro station. Quiet at night and well lit." },
    { l: 3, type: "apartment", title: "1-bedroom studio-style flat, Badda near Merul Link Road", area: "Badda", city: "Dhaka", ll: [23.7806, 90.4262], bed: 1, bath: 1, sqft: 620, floor: 4, furn: "unfurnished", rent: 16000, service: 1000, maint: 0,
      amenities: ["Lift", "Gas line", "Generator backup"], utils: [util("gas", "fixed", 800), util("water", "included"), util("electricity", "estimated", 1500)],
      desc: "Small, efficient flat for a single person or couple. Ten minutes from the Badda Link Road bus stand and the Aftab Nagar shops." },
    { l: 3, type: "apartment", title: "2-bedroom flat in Mohakhali DOHS close to BRAC University", area: "Mohakhali", city: "Dhaka", ll: [23.7780, 90.4000], bed: 2, bath: 2, sqft: 1150, floor: 5, furn: "unfurnished", rent: 35000, service: 2500, maint: 0,
      amenities: ["Lift", "Generator backup", "Gas line", "Car parking", "CCTV"], utils: [util("gas", "included"), util("water", "included"), util("electricity", "estimated", 2800)],
      desc: "Well-connected flat near Mohakhali bus terminal, Amtoli and the BRAC University campus. Fifth floor with good airflow." },
    { l: 1, type: "apartment", title: "Luxury 4-bedroom flat in Baridhara Diplomatic Zone", area: "Baridhara", city: "Dhaka", ll: [23.8007, 90.4219], bed: 4, bath: 5, sqft: 3200, floor: 6, furn: "unfurnished", rent: 140000, service: 12000, maint: 0,
      amenities: ["Lift", "Generator backup", "Gas line", "Car parking (3)", "24/7 security", "Swimming pool", "Gym", "CCTV"], utils: [util("gas", "included"), util("water", "included"), util("electricity", "not_disclosed")],
      desc: "Large family apartment in a secure compound with a pool and gym. Three covered parking spaces. Close to the international schools in Baridhara." },
    { l: 3, type: "apartment", title: "2-bedroom flat in Malibagh with open roof", area: "Malibagh", city: "Dhaka", ll: [23.7478, 90.4126], bed: 2, bath: 2, sqft: 950, floor: 3, furn: "unfurnished", rent: 22000, service: 1500, maint: 0,
      amenities: ["Gas line", "Rooftop access", "Lift"], utils: [util("gas", "fixed", 900), util("water", "included"), util("electricity", "estimated", 1800)],
      desc: "Practical flat close to Malibagh Railgate and the Moghbazar flyover. Residents share a clean open rooftop." },
    { l: 2, type: "apartment", title: "3-bedroom flat in Khulshi, Chattogram, near Foy's Lake", area: "Khulshi", city: "Chattogram", ll: [22.3569, 91.8113], bed: 3, bath: 3, sqft: 1500, floor: 4, furn: "unfurnished", rent: 30000, service: 2000, maint: 0,
      amenities: ["Lift", "Generator backup", "Gas line", "Car parking", "24/7 security"], utils: [util("gas", "included"), util("water", "included"), util("electricity", "estimated", 2500)],
      desc: "Family flat in a green part of Khulshi, ten minutes from Foy's Lake and Chittagong Medical College. Light and breezy with a view of the hills." },
    { l: 2, type: "apartment", title: "Furnished 2-bedroom flat at GEC Circle, Chattogram", area: "GEC Circle", city: "Chattogram", ll: [22.3590, 91.8217], bed: 2, bath: 2, sqft: 1100, floor: 6, furn: "furnished", rent: 38000, service: 3000, maint: 0,
      amenities: ["Furnished", "AC in bedrooms", "Lift", "Generator backup", "Gas line", "Wi-Fi ready"], utils: [util("gas", "included"), util("water", "included"), util("electricity", "estimated", 3500), util("internet", "fixed", 1000)],
      desc: "Walking distance from GEC Circle, the Chittagong Stock Exchange and several coaching centres. Air-conditioned bedrooms and a modern kitchen." },
    { l: 2, type: "house", title: "Ground-floor house with courtyard in Agrabad, Chattogram", area: "Agrabad", city: "Chattogram", ll: [22.3257, 91.8120], bed: 3, bath: 2, sqft: 1700, floor: 0, furn: "unfurnished", rent: 32000, service: 0, maint: 2000,
      amenities: ["Courtyard", "Gas line", "Generator backup", "Boundary wall", "Car parking"], utils: [util("gas", "fixed", 1000), util("water", "included"), util("electricity", "not_disclosed")],
      desc: "Self-contained ground-floor home with its own courtyard and entrance, a short ride from the Agrabad commercial area and the port." },
    { l: 3, type: "apartment", title: "2-bedroom flat in Upashahar, Sylhet, near the Surma view", area: "Upashahar", city: "Sylhet", ll: [24.9049, 91.8689], bed: 2, bath: 2, sqft: 1100, floor: 3, furn: "unfurnished", rent: 20000, service: 1500, maint: 0,
      amenities: ["Lift", "Gas line", "Generator backup", "Rooftop access"], utils: [util("gas", "fixed", 700), util("water", "included"), util("electricity", "estimated", 1800)],
      desc: "Calm residential area with tea gardens nearby. Close to the Sylhet MAG Osmani Medical College and Zindabazar. Good for a small family." },
    { l: 3, type: "room", title: "Private room in a shared flat, Dhanmondi 8A (female only)", area: "Dhanmondi", city: "Dhaka", ll: [23.7461, 90.3742], bed: 1, bath: 1, sqft: 160, floor: 3, furn: "furnished", rent: 9500, service: 0, maint: 0,
      amenities: ["Furnished", "Wi-Fi", "Gas line", "Lift"], utils: [util("gas", "included"), util("water", "included"), util("electricity", "fixed", 700), util("internet", "included")],
      shared: { totalOccupants: 3, availableSpots: 1, occupantGender: "female", bathroomType: "shared", sharedFacilities: ["kitchen", "bathroom", "living_room", "balcony"] },
      desc: "One private room available in a calm three-person flat. Bed, wardrobe and study table included. Close to Dhanmondi 27 and several universities." },
    { l: 3, type: "shared_room", title: "Bed space in a student flat, Mirpur 10", area: "Mirpur", city: "Dhaka", ll: [23.8069, 90.3687], bed: 1, bath: 1, sqft: 140, floor: 2, furn: "furnished", rent: 4500, service: 0, maint: 0,
      amenities: ["Furnished", "Wi-Fi", "Gas line", "Study desk"], utils: [util("gas", "included"), util("water", "included"), util("electricity", "fixed", 400), util("internet", "included")],
      shared: { totalOccupants: 4, availableSpots: 2, occupantGender: "male", bathroomType: "shared", sharedFacilities: ["kitchen", "bathroom", "dining_area"] },
      desc: "Two bed spaces in a clean room shared by four students. Five minutes from Mirpur 10 circle and the metro. No smoking." },
    { l: 3, type: "room", title: "Room for a working professional, Banani Road 27", area: "Banani", city: "Dhaka", ll: [23.7922, 90.4009], bed: 1, bath: 1, sqft: 180, floor: 5, furn: "furnished", rent: 14000, service: 0, maint: 0,
      amenities: ["Furnished", "AC", "Wi-Fi", "Lift", "Generator backup"], utils: [util("gas", "included"), util("water", "included"), util("electricity", "fixed", 1500), util("internet", "included")],
      shared: { totalOccupants: 2, availableSpots: 1, occupantGender: "any", bathroomType: "private", sharedFacilities: ["kitchen", "living_room"] },
      desc: "Air-conditioned private room with an attached bathroom in a two-person flat. Near the Banani office district and the Kemal Ataturk Avenue bus stops." },
];

// Deterministic 0..1 values so every run produces the same crops.
function pseudo(seed) {
    const x = Math.sin(seed * 9301 + 49297) * 233280;
    return x - Math.floor(x);
}

// Crops one of the five photos differently for each listing and encodes it as WebP.
export async function buildPhoto(listingIndex, slot) {
    const file = PHOTOS[(listingIndex * 2 + slot) % PHOTOS.length];
    const source = sharp(path.join(PHOTO_DIR, file));
    const { width, height } = await source.metadata();
    const scale = 0.72 + pseudo(listingIndex * 7 + slot) * 0.2;
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const left = Math.round((width - w) * pseudo(listingIndex * 13 + slot * 5 + 1));
    const top = Math.round((height - h) * pseudo(listingIndex * 17 + slot * 3 + 2));
    const buffer = await source
        .extract({ left, top, width: w, height: h })
        .resize({ width: 1280 })
        .modulate({ brightness: 0.96 + pseudo(listingIndex + slot) * 0.1, saturation: 0.95 + pseudo(listingIndex * 3 + slot) * 0.12 })
        .webp({ quality: 80 })
        .toBuffer();
    return { buffer, name: `${file.replace(".png", "")}-${listingIndex + 1}-${slot + 1}.webp` };
}

// Builds one unsaved Property document.
export function buildProperty(item, landlordId, index, imageIds = []) {
    const rent = item.rent;
    const pricing = {
        monthlyRent: rent,
        securityDeposit: item.type === "shared_room" ? rent : rent * 2,
        advanceRent: rent,
        // An explicit 0 means "no such charge"; an empty value would show as undisclosed.
        monthlyServiceCharge: item.service,
        monthlyMaintenanceCharge: item.maint,
        utilities: item.utils,
        otherFees: item.type === "room" || item.type === "shared_room" ? [] : [{ name: "Agreement stamp and registration", amount: 2500, frequency: "one_time", refundable: false, notes: "Paid once when signing." }],
    };
    const availability = new Date(Date.UTC(2026, 11, 1 + (index % 20)));
    return new Property({
        landlord: landlordId,
        title: item.title,
        description: item.desc,
        propertyType: item.type,
        sharedAccommodation: item.shared ?? null,
        address: { area: item.area, city: item.city, location: { type: "Point", coordinates: [item.ll[1], item.ll[0]] } },
        location: { latitude: item.ll[0], longitude: item.ll[1] },
        bedrooms: item.bed,
        bathrooms: item.bath,
        areaSqft: item.sqft,
        floor: item.floor,
        furnishing: item.furn,
        amenities: item.amenities,
        pricing,
        availabilityDate: availability,
        leaseDurationMonths: item.type === "shared_room" ? 6 : 12,
        houseRules: item.shared ? ["No smoking indoors", "Guests need prior notice", "Keep shared areas clean"] : ["No subletting without written consent", "Rent is due by the 5th of each month"],
        status: "published",
        images: imageIds,
    });
}

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);

async function main() {
    const dryRun = flag("dry-run") || !flag("confirm");
    // Validate every listing first, with no database needed.
    let problems = 0;
    for (const [index, item] of LISTINGS.entries()) {
        try {
            await buildProperty(item, new mongoose.Types.ObjectId(), index, []).validate();
        } catch (error) {
            problems += 1;
            console.error(`Listing ${index + 1} (${item.title}) is invalid: ${Object.values(error.errors ?? {}).map((e) => e.message).join("; ") || error.message}`);
        }
    }
    if (problems) throw new Error(`${problems} listing(s) failed validation.`);
    const sample = await buildPhoto(0, 0);
    console.log(`${LISTINGS.length} listings are valid. Sample photo: ${sample.name}, ${Math.round(sample.buffer.length / 1024)} KB.`);
    if (dryRun) {
        console.log("Dry run only. Add --confirm to write to MongoDB and R2.");
        return;
    }

    const { connectDatabase } = await import("../src/server/config/database.js");
    const { requireR2 } = await import("../src/server/config/r2.js");
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    const { deleteStoredObject } = await import("../src/server/services/fileUpload.service.js");
    await connectDatabase();
    const { client, bucket } = requireR2();

    const existing = await User.find({ firebaseUid: new RegExp(`^${UID_PREFIX}`) }).select("_id");
    if (existing.length && !flag("reset")) {
        throw new Error("Seed listings already exist. Use --reset to replace them.");
    }
    if (existing.length) {
        const ids = existing.map((u) => u._id);
        const files = await UploadedFile.find({ uploadedBy: { $in: ids } }).select("storageKey");
        for (const file of files) await deleteStoredObject(file.storageKey).catch(() => {});
        await UploadedFile.deleteMany({ uploadedBy: { $in: ids } });
        await Property.deleteMany({ landlord: { $in: ids } }, { includeDeleted: true });
        await User.deleteMany({ _id: { $in: ids } });
        console.log(`Removed an earlier seed (${ids.length} landlords).`);
    }

    const landlords = [];
    for (const [i, person] of LANDLORDS.entries()) {
        landlords.push(
            await User.create({
                firebaseUid: `${UID_PREFIX}${i + 1}`,
                email: null,
                displayName: person.name,
                role: "landlord",
                profile: { bio: person.bio, landlord: { contactHours: person.hours } },
            })
        );
    }

    for (const [index, item] of LISTINGS.entries()) {
        const landlord = landlords[item.l];
        const property = buildProperty(item, landlord._id, index, []);
        const imageIds = [];
        for (const slot of [0, 1]) {
            const { buffer, name } = await buildPhoto(index, slot);
            const storageKey = `seed/${property._id}/${crypto.randomUUID()}.webp`;
            await client.send(new PutObjectCommand({ Bucket: bucket, Key: storageKey, Body: buffer, ContentType: "image/webp" }));
            const file = await UploadedFile.create({
                uploadedBy: landlord._id,
                property: property._id,
                purpose: "property_image",
                originalName: name,
                storageKey,
                mimeType: "image/webp",
                sizeBytes: buffer.length,
                sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
                hashedAt: new Date(),
                status: "uploaded",
            });
            imageIds.push(file._id);
        }
        property.images = imageIds;
        await property.save();
        console.log(`${String(index + 1).padStart(2)}. ${item.title} (${item.city}) saved with ${imageIds.length} photos.`);
    }
    console.log(`Done: ${LISTINGS.length} published listings.`);
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
