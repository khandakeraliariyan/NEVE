// Automatic consistency checks on payment records and meter readings. Each
// flag is something to review, not a finding about which record is right.

const TOLERANCE_BDT = 0.5;
const METER_TYPES = ["electricity", "gas", "water"];

const monthKey = (date) => new Date(date).toISOString().slice(0, 7);
const differs = (a, b) => Math.abs(a - b) > TOLERANCE_BDT;

export function findPaymentConflicts(agreement) {
    const conflicts = [];
    const payments = (agreement.payments ?? []).filter((payment) => Number.isFinite(payment.amountBdt));

    // Rent: records for the same month that disagree, or a month's total that
    // differs from the agreed monthly rent.
    const rentByMonth = new Map();
    for (const payment of payments.filter((item) => item.paymentType === "rent" && item.paidAt)) {
        const key = monthKey(payment.paidAt);
        rentByMonth.set(key, [...(rentByMonth.get(key) ?? []), payment]);
    }
    for (const [month, records] of rentByMonth) {
        const recorders = new Set(records.map((record) => String(record.recordedBy)));
        const amounts = new Set(records.map((record) => record.amountBdt));
        if (records.length > 1 && recorders.size > 1 && amounts.size > 1) {
            conflicts.push({
                type: "conflicting_payment_records",
                paymentType: "rent",
                month,
                targetIds: records.map((record) => String(record._id)),
                amounts: records.map((record) => record.amountBdt),
                message: `The renter and landlord recorded different rent amounts for ${month}.`,
            });
            continue;
        }
        const total = records.reduce((sum, record) => sum + record.amountBdt, 0);
        if (Number.isFinite(agreement.monthlyRentBdt) && differs(total, agreement.monthlyRentBdt)) {
            conflicts.push({
                type: "payment_amount_mismatch",
                paymentType: "rent",
                month,
                targetIds: records.map((record) => String(record._id)),
                recordedTotalBdt: total,
                agreedAmountBdt: agreement.monthlyRentBdt,
                message: `Rent recorded for ${month} (${total} BDT) differs from the agreed monthly rent (${agreement.monthlyRentBdt} BDT).`,
            });
        }
    }

    // Deposit and advance: total recorded vs the agreed amount.
    for (const [paymentType, field] of [["deposit", "depositBdt"], ["advance", "advanceRentBdt"]]) {
        const records = payments.filter((payment) => payment.paymentType === paymentType);
        if (!records.length || !Number.isFinite(agreement[field])) continue;
        const total = records.reduce((sum, record) => sum + record.amountBdt, 0);
        if (differs(total, agreement[field])) {
            conflicts.push({
                type: "payment_amount_mismatch",
                paymentType,
                targetIds: records.map((record) => String(record._id)),
                recordedTotalBdt: total,
                agreedAmountBdt: agreement[field],
                message: `${paymentType === "deposit" ? "Deposit" : "Advance"} payments recorded (${total} BDT) differ from the agreed amount (${agreement[field]} BDT).`,
            });
        }
    }

    return conflicts;
}

// The latest reading per meter in a report, ignoring superseded entries.
function currentMeterReadings(report) {
    const entries = (report?.entries ?? []).filter((entry) => entry.kind === "meter_reading");
    const superseded = new Set(entries.map((entry) => entry.supersedes).filter(Boolean).map(String));
    const readings = new Map();
    for (const entry of entries) {
        if (superseded.has(String(entry._id)) || !METER_TYPES.includes(entry.meterType)) continue;
        if (!Number.isFinite(entry.reading)) continue;
        const existing = readings.get(entry.meterType);
        if (!existing || new Date(entry.recordedAt) > new Date(existing.recordedAt)) {
            readings.set(entry.meterType, entry);
        }
    }
    return readings;
}

export function findMeterReadingIssues(conditionReports = []) {
    const missing = [];
    const conflicts = [];
    const moveIn = conditionReports.find((report) => report.stage === "move_in");
    const moveOut = conditionReports.find((report) => report.stage === "move_out");
    const inReadings = currentMeterReadings(moveIn);
    const outReadings = currentMeterReadings(moveOut);

    if (moveIn && inReadings.size === 0) {
        missing.push({
            type: "missing_meter_readings",
            stage: "move_in",
            targetId: String(moveIn._id),
            message: "The move-in record has no meter readings.",
        });
    }

    if (moveOut) {
        if (outReadings.size === 0) {
            missing.push({
                type: "missing_meter_readings",
                stage: "move_out",
                targetId: String(moveOut._id),
                message: "The move-out record has no meter readings.",
            });
        }
        for (const [meterType, inEntry] of inReadings) {
            const outEntry = outReadings.get(meterType);
            if (!outEntry) {
                if (outReadings.size > 0) {
                    missing.push({
                        type: "missing_meter_reading",
                        stage: "move_out",
                        meterType,
                        targetId: String(moveOut._id),
                        message: `A ${meterType} reading was recorded at move-in but not at move-out.`,
                    });
                }
            } else if (outEntry.reading < inEntry.reading) {
                conflicts.push({
                    type: "meter_reading_decreased",
                    meterType,
                    targetIds: [String(inEntry._id), String(outEntry._id)],
                    moveInReading: inEntry.reading,
                    moveOutReading: outEntry.reading,
                    message: `The move-out ${meterType} reading is lower than the move-in reading.`,
                });
            }
        }
        for (const meterType of outReadings.keys()) {
            if (moveIn && !inReadings.has(meterType)) {
                missing.push({
                    type: "missing_meter_reading",
                    stage: "move_in",
                    meterType,
                    targetId: String(moveIn._id),
                    message: `A ${meterType} reading was recorded at move-out but not at move-in.`,
                });
            }
        }
    }

    return { missing, conflicts };
}
