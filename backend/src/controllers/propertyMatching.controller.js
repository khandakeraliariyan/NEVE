import { getMatchedProperties } from "../services/propertyMatching.service.js";

const getUserId = (req) => req.user?._id || req.user?.id;

export const getPersonalizedRecommendations = async (req, res) => {
    try {
        const page = Number(req.query.page ?? 1);
        const limit = Number(req.query.limit ?? 10);

        if (
            !Number.isInteger(page) ||
            page < 1 ||
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 50
        ) {
            return res.status(400).json({
                message:
                    "page must be positive and limit must be between 1 and 50.",
            });
        }

        const recommendations = await getMatchedProperties(getUserId(req), {
            page,
            limit,
        });

        if (!recommendations.hasPreferences) {
            return res.status(200).json({
                message: "Set your renter preferences to receive recommendations.",
                hasPreferences: false,
                results: [],
            });
        }

        return res.status(200).json({
            message: "Personalized recommendations retrieved successfully.",
            ...recommendations,
        });
    } catch (error) {
        console.error("Personalized recommendations error:", error);

        return res.status(500).json({
            message: "Could not retrieve personalized recommendations.",
        });
    }
};
