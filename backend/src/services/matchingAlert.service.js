import Notification from "../models/Notification.js";
import RenterPreference from "../models/RenterPreference.js";
import { calculateMatch } from "./propertyMatching.service.js";

const MATCH_ALERT_MINIMUM_SCORE = 70;

export function meetsMatchingAlertThreshold(match) {
    return (
        match.score !== null &&
        match.score >= MATCH_ALERT_MINIMUM_SCORE &&
        match.withinBudget !== false
    );
}

export async function notifyRentersOfMatchingProperty(property) {
    const preferences = await RenterPreference.find({
        alertsEnabled: { $ne: false },
        renter: { $ne: property.landlord },
    }).lean();

    const notifications = preferences.flatMap((preference) => {
        const match = calculateMatch(property, preference);
        if (!meetsMatchingAlertThreshold(match)) {
            return [];
        }

        const location = [
            property.address?.area,
            property.address?.city,
        ]
            .filter(Boolean)
            .join(", ");

        return [
            {
                updateOne: {
                    filter: {
                        recipient: preference.renter,
                        type: "matching_listing_available",
                        relatedProperty: property._id,
                    },
                    update: {
                        $setOnInsert: {
                            recipient: preference.renter,
                            type: "matching_listing_available",
                            title: "A new property matches your preferences",
                            message: `${property.title}${location ? ` in ${location}` : ""} matches your preferences (${match.score}%).`,
                            relatedProperty: property._id,
                        },
                    },
                    upsert: true,
                },
            },
        ];
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
