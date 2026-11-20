import Property from "../models/Property.js";

import {
    matchProperty,
    validatePreferences,
} from "../services/propertyMatching.service.js";

export async function getRecommendations(req, res, next) {
    try {
        const preferences = req.body;

        if (
            !preferences ||
            typeof preferences !== "object" ||
            Array.isArray(preferences)
        ) {
            return res.status(400).json({
                success: false,
                message: "Preferences must be a JSON object",
            });
        }

        const allowedFields = [
            "minRent",
            "maxRent",
            "bedrooms",
            "propertyType",
            "furnishing",
            "amenities",
        ];

        const unexpectedFields = Object.keys(preferences).filter(
            (key) => !allowedFields.includes(key)
        );

        if (unexpectedFields.length) {
            return res.status(400).json({
                success: false,
                message: `Unsupported preference fields: ${unexpectedFields.join(", ")}`,
            });
        }

        const errors = validatePreferences(preferences);

        if (errors.length) {
            return res.status(400).json({
                success: false,
                message: "Invalid preferences",
                errors,
            });
        }

        // Limit the candidate set for this initial MVP.
        const properties = await Property.find({
            status: "published",
        })
            .populate("landlord", "displayName photoURL")
            .sort({ createdAt: -1 })
            .limit(200)
            .lean();

        const recommendations = properties
            .map((property) => ({
                property,
                match: matchProperty(property, preferences),
            }))
            .sort((a, b) => {
                // Evaluated matches come before listings with no score.
                const scoreA = a.match.score ?? -1;
                const scoreB = b.match.score ?? -1;

                if (scoreA !== scoreB) {
                    return scoreB - scoreA;
                }

                return (
                    a.property.pricing.monthlyRent -
                    b.property.pricing.monthlyRent
                );
            })
            .map(({ property, match }) => ({
                property,
                match,
            }));

        return res.status(200).json({
            success: true,
            count: recommendations.length,
            evaluatedCandidates: properties.length,
            candidateLimit: 200,
            preferences,
            recommendations,
            note:
                "Recommendations use listing attributes and deterministic scoring. They are not guarantees of property suitability. Only the newest 200 published listings were evaluated.",
        });
    } catch (error) {
        next(error);
    }
}