function currentEntries(report) {
    const superseded = new Set(
        report.entries
            .map((entry) => entry.supersedes)
            .filter(Boolean)
            .map(String)
    );

    return report.entries.filter((entry) => !superseded.has(String(entry._id)));
}

export function compareConditionReports(moveInReport, moveOutReport) {
    if (!moveInReport || !moveOutReport) {
        return {
            available: false,
            missingStages: [
                ...(!moveInReport ? ["move_in"] : []),
                ...(!moveOutReport ? ["move_out"] : []),
            ],
            changes: [],
        };
    }

    const moveIn = new Map(
        currentEntries(moveInReport).map((entry) => [entry.recordKey, entry])
    );
    const moveOut = new Map(
        currentEntries(moveOutReport).map((entry) => [entry.recordKey, entry])
    );
    const keys = new Set([...moveIn.keys(), ...moveOut.keys()]);
    const changes = [...keys].sort().map((key) => {
        const before = moveIn.get(key) ?? null;
        const after = moveOut.get(key) ?? null;

        if (!before) {
            return { recordKey: key, change: "not_recorded_at_move_in", moveIn: null, moveOut: after };
        }
        if (!after) {
            return { recordKey: key, change: "not_recorded_at_move_out", moveIn: before, moveOut: null };
        }
        if (before.kind === "meter_reading") {
            return {
                recordKey: key,
                change:
                    before.reading === after.reading && before.unit === after.unit
                        ? "unchanged"
                        : "meter_reading_changed",
                moveIn: before,
                moveOut: after,
                readingDelta:
                    before.unit === after.unit
                        ? after.reading - before.reading
                        : null,
            };
        }

        return {
            recordKey: key,
            change:
                before.condition === after.condition &&
                before.notes === after.notes
                    ? "unchanged"
                    : "condition_changed",
            moveIn: before,
            moveOut: after,
        };
    });

    return {
        available: true,
        missingStages: [],
        changes,
        disclaimer:
            "This comparison reports differences in recorded entries only. It does not determine when damage occurred or assign responsibility.",
    };
}
