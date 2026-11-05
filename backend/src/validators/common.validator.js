import { z } from "zod";
import {
    BATHROOM_TYPES,
    OCCUPANT_GENDERS,
    PROPERTY_TYPES,
} from "../constants/propertyTypes.js";

const amenitiesSchema = z.preprocess(
    (value) => {
        if (typeof value === "string") {
            return value.split(",");
        }

        return value;
    },
    z
        .array(z.string().trim().min(1).max(60))
        .max(50)
        .optional()
);

const propertySearchFields = {
    city: z.string().trim().max(100).optional(),
    area: z.string().trim().max(100).optional(),
    propertyType: z
        .enum(PROPERTY_TYPES)
        .optional(),
    occupantGender: z.enum(OCCUPANT_GENDERS).optional(),
    bathroomType: z.enum(BATHROOM_TYPES).optional(),
    minAvailableSpots: z.coerce.number().int().min(1).max(50).optional(),
    furnishing: z
        .enum(["furnished", "unfurnished"])
        .optional(),
    minRent: z.coerce.number().min(0).optional(),
    maxRent: z.coerce.number().min(0).optional(),
    bedrooms: z.coerce.number().int().min(0).max(100).optional(),
    maxBedrooms: z.coerce.number().int().min(0).max(100).optional(),
    availableBy: z.coerce.date().optional(),
    minLeaseDurationMonths: z.coerce.number().int().min(1).max(120).optional(),
    maxLeaseDurationMonths: z.coerce.number().int().min(1).max(120).optional(),
    amenities: amenitiesSchema,
    q: z.string().trim().max(100).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
    sort: z
        .enum(["rent_asc", "rent_desc", "newest", "oldest"])
        .default("newest"),
};

const validatePropertySearchRanges = (query, context) => {
    if (
        query.minRent !== undefined &&
        query.maxRent !== undefined &&
        query.minRent > query.maxRent
    ) {
        context.addIssue({
            code: "custom",
            message: "Minimum rent cannot exceed maximum rent.",
            path: ["minRent"],
        });
    }

    if (
        query.bedrooms !== undefined &&
        query.maxBedrooms !== undefined &&
        query.bedrooms > query.maxBedrooms
    ) {
        context.addIssue({
            code: "custom",
            message: "Minimum bedrooms cannot exceed maximum bedrooms.",
            path: ["bedrooms"],
        });
    }

    if (
        query.minLeaseDurationMonths !== undefined &&
        query.maxLeaseDurationMonths !== undefined &&
        query.minLeaseDurationMonths > query.maxLeaseDurationMonths
    ) {
        context.addIssue({
            code: "custom",
            message:
                "Minimum lease duration cannot exceed maximum lease duration.",
            path: ["minLeaseDurationMonths"],
        });
    }
};

export const objectIdSchema = z
    .string()
    .regex(/^[a-f\d]{24}$/i, "Invalid ID format.");

export const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const paginationRequestSchema = z.object({
    query: paginationSchema,
});

export const propertySearchQuerySchema = z
    .object(propertySearchFields)
    .superRefine(validatePropertySearchRanges);

export const propertySearchSchema = z.object({
    query: propertySearchQuerySchema,
});

export const nearbyPropertySearchSchema = z.object({
    query: z
        .object({
            ...propertySearchFields,
            latitude: z.coerce.number().min(-90).max(90),
            longitude: z.coerce.number().min(-180).max(180),
            radius: z.coerce.number().int().min(100).max(5000).default(5000),
        })
        .superRefine(validatePropertySearchRanges),
});

export const mongoIdParamsSchema = z.object({
    params: z.object({
        id: objectIdSchema,
    }),
});
