import { validateSmartChoicePreferences } from "../services/smartChoice.service.js";
import RenterPreference from "../models/RenterPreference.js";
import { PROPERTY_TYPES as ALL_PROPERTY_TYPES } from "../constants/propertyTypes.js";

const getUserId = (req) => req.neveUser._id;

const allowedFields = [
    "cities",
    "areas",
    "minRent",
    "maxRent",
    "bedrooms",
    "propertyTypes",
    "furnishing",
    "amenities",
    "alertsEnabled",
    "commute",
    "walkingDistance",
    "household",
];

const PROPERTY_TYPES = ALL_PROPERTY_TYPES;
const FURNISHING_TYPES = [
    "furnished",
    "unfurnished",
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
                furnishing: null,
                amenities: [],
                alertsEnabled: true,
                commute: null,
                walkingDistance: null,
                household: null,
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

        const smartChoice = validateSmartChoicePreferences(body);
        if (smartChoice.error) {
            return res.status(400).json({ message: smartChoice.error });
        }
        Object.assign(updates, smartChoice.updates);

        if (body.alertsEnabled !== undefined) {
            if (typeof body.alertsEnabled !== "boolean") {
                return res.status(400).json({
                    message: "alertsEnabled must be a boolean.",
                });
            }
            updates.alertsEnabled = body.alertsEnabled;
        }

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

        if (body.propertyTypes !== undefined) {
            const invalidTypes = updates.propertyTypes.filter(
                (value) => !PROPERTY_TYPES.includes(value)
            );

            if (invalidTypes.length > 0) {
                return res.status(400).json({
                    message: "propertyTypes contains an unsupported value.",
                    allowedValues: PROPERTY_TYPES,
                });
            }
        }

        if (body.furnishing !== undefined) {
            if (
                body.furnishing !== null &&
                !FURNISHING_TYPES.includes(body.furnishing)
            ) {
                return res.status(400).json({
                    message:
                        "furnishing must be a supported furnishing value or null.",
                    allowedValues: FURNISHING_TYPES,
                });
            }

            updates.furnishing = body.furnishing;
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
                returnDocument: "after",
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