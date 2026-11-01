import Notification from "../models/Notification.js";
import RenterPreference from "../models/RenterPreference.js";
import SavedSearch from "../models/SavedSearch.js";
import { calculateMatch } from "./propertyMatching.service.js";
import { propertyMatchesSavedSearch } from "./savedSearch.service.js";

const MATCH_ALERT_MINIMUM_SCORE = 70;

export function meetsMatchingAlertThreshold(match) {
    return (
        match.score !== null &&
        match.score >= MATCH_ALERT_MINIMUM_SCORE &&
        match.withinBudget !== false
    );
}

export async function notifyRentersOfMatchingProperty(property) {
    const [preferences, savedSearches] = await Promise.all([
        RenterPreference.find({
            alertsEnabled: { $ne: false },
            renter: { $ne: property.landlord },
        }).lean(),
        SavedSearch.find({
            alertsEnabled: true,
            renter: { $ne: property.landlord },
        }).lean(),
    ]);

    const matchingRenters = new Map();
    for (const preference of preferences) {
        const match = calculateMatch(property, preference);
        if (!meetsMatchingAlertThreshold(match)) {
            continue;
        }
        matchingRenters.set(String(preference.renter), {
            renter: preference.renter,
            preferenceScore: match.score,
            savedSearchNames: [],
        });
    }

    for (const savedSearch of savedSearches) {
        if (!propertyMatchesSavedSearch(property, savedSearch)) continue;
        const key = String(savedSearch.renter);
        const match = matchingRenters.get(key) ?? {
            renter: savedSearch.renter,
            preferenceScore: null,
            savedSearchNames: [],
        };
        match.savedSearchNames.push(savedSearch.name);
        matchingRenters.set(key, match);
    }

    const location = [property.address?.area, property.address?.city]
        .filter(Boolean)
        .join(", ");

    const notifications = [...matchingRenters.values()].map((match) => {
        const displayedNames = match.savedSearchNames.slice(0, 5);
        const savedSearchSummary = displayedNames.length
            ? ` It matches ${match.savedSearchNames.length === 1 ? "saved search" : "saved searches"}: ${displayedNames.map((name) => `"${name}"`).join(", ")}${match.savedSearchNames.length > displayedNames.length ? ", and others" : ""}.`
            : "";
        const preferenceSummary =
            match.preferenceScore === null
                ? ""
                : ` It matches your preferences (${match.preferenceScore}%).`;
        return {
            updateOne: {
                filter: {
                    recipient: match.renter,
                    type: "matching_listing_available",
                    relatedProperty: property._id,
                },
                update: {
                    $setOnInsert: {
                        recipient: match.renter,
                        type: "matching_listing_available",
                        title: match.savedSearchNames.length
                            ? "A new property matches a saved search"
                            : "A new property matches your preferences",
                        message: `${property.title}${location ? ` in ${location}` : ""}.${preferenceSummary}${savedSearchSummary}`.slice(
                            0,
                            1000
                        ),
                        relatedProperty: property._id,
                    },
                },
                upsert: true,
            },
        };
    });

    if (notifications.length === 0) {
        return { matchedRenterCount: 0, deliveredCount: 0 };
    }

    try {
        const result = await Notification.bulkWrite(notifications, {
            ordered: false,
        });
        return {
            matchedRenterCount: notifications.length,
            deliveredCount: result.upsertedCount,
        };
    } catch (error) {
        const writeErrors = error.writeErrors ?? [];
        if (
            writeErrors.length > 0 &&
            writeErrors.every((writeError) => writeError.code === 11000)
        ) {
            return {
                matchedRenterCount: notifications.length,
                deliveredCount: error.result?.upsertedCount ?? 0,
            };
        }
        throw error;
    }
}
