// Seeds one SYNTHETIC tenancy-dispute scenario for demonstrations: a listing,
// an agreement with clauses and payments, a disputed maintenance request and
// a move-in condition record. All names, places and amounts are invented and
// every record title starts with "[DEMO]".
//
//   npm run seed-demo -- --dry-run
//   npm run seed-demo -- --renter renter@example.com --landlord landlord@example.com --confirm
//   npm run seed-demo -- --renter ... --landlord ... --confirm --reset   (replace an earlier demo)
//
// The renter and landlord must already have Neve accounts (they sign in with
// Firebase, so the script can't create them). No files are created: the demo
// shows "no photo attached" flags until someone uploads a photo live.
import path from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

import ConditionReport from "../src/models/ConditionReport.js";
import ContractRiskAnalysis from "../src/models/ContractRiskAnalysis.js";
import Inquiry from "../src/models/Inquiry.js";
import MaintenanceRequest from "../src/models/MaintenanceRequest.js";
import Property from "../src/models/Property.js";
import TenancyAgreement from "../src/models/TenancyAgreement.js";
import User from "../src/models/User.js";
import { appendAuditEvent } from "../src/services/tenancyAgreement.service.js";

const DEMO = "[DEMO]";
const args = process.argv.slice(2);
const valueOf = (name) => {
    const index = args.indexOf(`--${name}`);
    return index === -1 ? undefined : args[index + 1]?.trim().toLowerCase();
};
const day = (value) => new Date(`${value}T00:00:00.000Z`);

// Builds the scenario's documents (unsaved) for the given user IDs.
export function buildDemoScenario({ renterId, landlordId }) {
    const property = new Property({
        landlord: landlordId,
        title: `${DEMO} 2-bedroom flat, Road 12 (synthetic listing)`,
        description: "Synthetic listing for a Neve demonstration. Not a real property.",
        propertyType: "apartment",
        address: { area: "Dhanmondi", city: "Dhaka" },
        bedrooms: 2,
        bathrooms: 2,
        furnishing: "unfurnished",
        pricing: { monthlyRent: 22000, securityDeposit: 44000, advanceRent: null },
        status: "paused",
    });
    const inquiry = new Inquiry({
        property: property._id,
        renter: renterId,
        landlord: landlordId,
        message: `${DEMO} Synthetic inquiry for the demonstration scenario.`,
        status: "accepted",
    });
    const clause = (category, heading, text) => ({ category, heading, text, origin: "user", reviewStatus: "confirmed", createdBy: landlordId, updatedBy: landlordId });
    const agreement = new TenancyAgreement({
        property: property._id,
        inquiry: inquiry._id,
        renter: renterId,
        landlord: landlordId,
        createdBy: landlordId,
        title: `${DEMO} Road 12 flat tenancy (synthetic)`,
        jurisdiction: "Bangladesh",
        status: "shared",
        startAt: day("2026-01-01"),
        endAt: day("2026-12-31"),
        monthlyRentBdt: 25000,
        depositBdt: 50000,
        advanceRentBdt: 25000,
        clauses: [
            clause("term", "Term", "This tenancy runs from 1 January 2026 to 31 December 2026."),
            clause("rent", "Rent", "The tenant shall pay a monthly rent of Tk 25,000 by the 5th day of each month by bank transfer."),
            clause("deposit", "Security deposit", "The tenant has paid a security deposit of Tk 50,000. The landlord may deduct any amount for damage from the deposit."),
            clause("maintenance", "Repairs", "The landlord is responsible for structural repairs and plumbing. Minor repairs are the tenant's responsibility."),
            clause("notice", "Ending the tenancy", "Either party may end this agreement by giving two months' written notice."),
        ],
        payments: [
            { paymentType: "deposit", amountBdt: 50000, paidAt: day("2025-12-28"), payer: "renter", recordedBy: renterId },
            { paymentType: "advance", amountBdt: 25000, paidAt: day("2025-12-28"), payer: "renter", recordedBy: renterId },
            { paymentType: "rent", amountBdt: 25000, paidAt: day("2026-01-04"), payer: "renter", recordedBy: renterId },
            { paymentType: "rent", amountBdt: 25000, paidAt: day("2026-02-05"), payer: "renter", recordedBy: renterId },
            { paymentType: "rent", amountBdt: 25000, paidAt: day("2026-03-05"), payer: "renter", recordedBy: renterId },
            { paymentType: "rent", amountBdt: 20000, paidAt: day("2026-03-05"), payer: "renter", recordedBy: landlordId },
        ],
    });
    appendAuditEvent(agreement, landlordId, "demo_scenario_seeded");
    const leak = new MaintenanceRequest({
        agreement: agreement._id,
        property: property._id,
        title: `${DEMO} Water leak from the bathroom ceiling`,
        description: "Water has been dripping from the bathroom ceiling since 10 March. The stain is spreading and the light fitting is wet.",
        location: "Bathroom",
        category: "plumbing",
        priority: "high",
        status: "disputed",
        submittedBy: renterId,
        createdAt: day("2026-03-10"),
        history: [
            { actor: renterId, status: "submitted", message: "Reported the leak. Photos to follow.", createdAt: day("2026-03-10") },
            { actor: landlordId, status: "disputed", responsibility: "renter", message: "The leak was caused by misuse of the bathroom, so the tenant should pay for it.", createdAt: day("2026-03-12") },
            { actor: renterId, responsibility: "landlord", message: "The pipe above the ceiling is old; the leak started without any use of the bathroom.", createdAt: day("2026-03-13") },
        ],
    });
    const moveIn = new ConditionReport({
        agreement: agreement._id,
        property: property._id,
        stage: "move_in",
        createdBy: renterId,
        entries: [
            { recordKey: "bathroom-ceiling", kind: "room_condition", room: "Bathroom", item: "Ceiling", condition: "good", notes: "No stains or damp at move-in.", recordedBy: renterId, recordedAt: day("2026-01-01") },
            { recordKey: "meter-electricity", kind: "meter_reading", meterType: "electricity", reading: 5400, unit: "kWh", recordedBy: renterId, recordedAt: day("2026-01-01") },
        ],
    });
    return { property, inquiry, agreement, leak, moveIn };
}

async function removeEarlierDemo(renterId, landlordId) {
    const agreements = await TenancyAgreement.find({ renter: renterId, landlord: landlordId, title: { $regex: "^\\[DEMO\\]" } }).select("_id property inquiry");
    for (const agreement of agreements) {
        await Promise.all([
            MaintenanceRequest.deleteMany({ agreement: agreement._id, title: { $regex: "^\\[DEMO\\]" } }),
            ConditionReport.deleteMany({ agreement: agreement._id }),
            ContractRiskAnalysis.deleteMany({ agreement: agreement._id }),
            Inquiry.deleteOne({ _id: agreement.inquiry, message: { $regex: "^\\[DEMO\\]" } }),
            Property.deleteOne({ _id: agreement.property, landlord: landlordId, title: { $regex: "^\\[DEMO\\]" } }),
        ]);
        await TenancyAgreement.deleteOne({ _id: agreement._id });
    }
    return agreements.length;
}

async function main() {
    if (args.includes("--dry-run")) {
        const docs = buildDemoScenario({ renterId: new mongoose.Types.ObjectId(), landlordId: new mongoose.Types.ObjectId() });
        for (const [name, doc] of Object.entries(docs)) {
            await doc.validate().catch((error) => {
                throw new Error(`${name}: ${error.message}`);
            });
            console.log(`✓ ${name} is valid`);
        }
        return;
    }
    const renterEmail = valueOf("renter");
    const landlordEmail = valueOf("landlord");
    if (!renterEmail || !landlordEmail || !args.includes("--confirm")) {
        throw new Error("Usage: npm run seed-demo -- --renter renter@example.com --landlord landlord@example.com --confirm [--reset]");
    }
    const { connectDatabase } = await import("../src/config/database.js");
    await connectDatabase();
    try {
        const [renter, landlord] = await Promise.all([
            User.findOne({ email: renterEmail, role: "renter", isActive: true }).select("_id"),
            User.findOne({ email: landlordEmail, role: "landlord", isActive: true }).select("_id"),
        ]);
        if (!renter) throw new Error(`No active renter account has the email ${renterEmail}.`);
        if (!landlord) throw new Error(`No active landlord account has the email ${landlordEmail}.`);
        const existing = await TenancyAgreement.exists({ renter: renter._id, landlord: landlord._id, title: { $regex: "^\\[DEMO\\]" } });
        if (existing && !args.includes("--reset")) throw new Error("A demo scenario already exists for these accounts. Re-run with --reset to replace it.");
        if (existing) console.log(`Removed ${await removeEarlierDemo(renter._id, landlord._id)} earlier demo scenario(s).`);
        const docs = buildDemoScenario({ renterId: renter._id, landlordId: landlord._id });
        for (const doc of [docs.property, docs.inquiry, docs.agreement, docs.leak, docs.moveIn]) await doc.save();
        console.log(`Created the demo agreement ${docs.agreement._id}: open /agreements/${docs.agreement._id} as either account.`);
    } finally {
        await mongoose.disconnect();
    }
}

// Run only when executed directly, so tests can import buildDemoScenario.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(error.message ?? error);
        process.exit(1);
    });
}
