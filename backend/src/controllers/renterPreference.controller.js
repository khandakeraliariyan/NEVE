import RenterPreference from "../models/RenterPreference.js";

const getUserId = (req) => req.user?._id || req.user?.id;

const allowedFields = [
    "cities",
    "areas",
    "minRent",
    "maxRent",
    "bedrooms",
    "propertyTypes",
    "amenities",
];

export const getRenterPreferences = async (req, res) => {
    try {
        const preferences = await RenterPreference.findOne({
            renter: getUserId(req),
        }).lean();

        return res.json({
            preferences: preferences || {
                cities: [],
                areas: [],
                minRent: null,
                maxRent: null,
                bedrooms: [],
                propertyTypes: [],
                amenities: [],
            },
        });
    } catch (error) {
        console.error("Get preferences error:", error);
        return res.status(500).json({
            message: "Could not retrieve preferences.",
        });
    }
};

export const updateRenterPreferences = async (req, res) => {
    try {
        const body = req.body;

        if (!body || typeof body !== "object" || Array.isArray(body)) {
            return res.status(400).json({
                message: "Request body must be an object.",
            });
        }

        const unknownFields = Object.keys(body).filter(
            (key) => !allowedFields.includes(key)
        );

        if (unknownFields.length > 0) {
            return res.status(400).json({
                message: "Unsupported preference fields.",
                fields: unknownFields,
            });
        }

        const updates = {};

        for (const key of ["cities", "areas", "propertyTypes", "amenities"]) {
            if (body[key] !== undefined) {
                if (
                    !Array.isArray(body[key]) ||
                    body[key].length > 30 ||
                    !body[key].every(
                        (value) =>
                            typeof value === "string" &&
                            value.trim().length > 0 &&
                            value.length <= 100
                    )
                ) {
                    return res.status(400).json({
                        message: `${key} must be an array of up to 30 non-empty strings.`,
                    });
                }

                updates[key] = [
                    ...new Set(body[key].map((value) => value.trim())),
                ];
            }
        }

        if (body.bedrooms !== undefined) {
            if (
                !Array.isArray(body.bedrooms) ||
                body.bedrooms.length > 10 ||
                !body.bedrooms.every(
                    (value) => Number.isInteger(value) && value >= 0 && value <= 20
                )
            ) {
                return res.status(400).json({
                    message: "bedrooms must contain integers between 0 and 20.",
                });
            }

            updates.bedrooms = [...new Set(body.bedrooms)];
        }

        for (const key of ["minRent", "maxRent"]) {
            if (body[key] !== undefined) {
                if (
                    body[key] !== null &&
                    (!Number.isFinite(body[key]) || body[key] < 0)
                ) {
                    return res.status(400).json({
                        message: `${key} must be a non-negative number or null.`,
                    });
                }

                updates[key] = body[key];
            }
        }

        const existing = await RenterPreference.findOne({
            renter: getUserId(req),
        }).lean();

        const minRent =
            updates.minRent !== undefined
                ? updates.minRent
                : existing?.minRent ?? null;

        const maxRent =
            updates.maxRent !== undefined
                ? updates.maxRent
                : existing?.maxRent ?? null;

        if (
            minRent !== null &&
            maxRent !== null &&
            minRent > maxRent
        ) {
            return res.status(400).json({
                message: "minRent cannot exceed maxRent.",
            });
        }

        const preferences = await RenterPreference.findOneAndUpdate(
            { renter: getUserId(req) },
            {
                $set: {
                    ...updates,
                    renter: getUserId(req),
                },
            },
            {
                new: true,
                upsert: true,
                runValidators: true,
                setDefaultsOnInsert: true,
            }
        );

        return res.json({
            message: "Renter preferences updated successfully.",
            preferences,
        });
    } catch (error) {
        console.error("Update preferences error:", error);
        return res.status(500).json({
            message: "Could not update preferences.",
        });
    }
};