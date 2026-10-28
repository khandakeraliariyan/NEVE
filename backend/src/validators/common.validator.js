import { z } from "zod";

export const objectIdSchema = z
    .string()
    .regex(/^[a-f\d]{24}$/i, "Invalid ID format.");

export const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
});

export const propertySearchSchema = z.object({
    query: z
        .object({
            city: z.string().trim().max(100).optional(),
            area: z.string().trim().max(100).optional(),
            propertyType: z.string().trim().max(50).optional(),
            minRent: z.coerce.number().min(0).optional(),
            maxRent: z.coerce.number().min(0).optional(),
            bedrooms: z.coerce.number().int().min(0).optional(),
            page: z.coerce.number().int().min(1).default(1),
            limit: z.coerce.number().int().min(1).max(50).default(10),
            sort: z.enum(["rent_asc", "rent_desc", "newest"]).default("newest"),
        })
        .refine(
            (query) =>
                query.minRent === undefined ||
                query.maxRent === undefined ||
                query.minRent <= query.maxRent,
            {
                message: "Minimum rent cannot exceed maximum rent.",
                path: ["minRent"],
            }
        ),
});

export const mongoIdParamsSchema = z.object({
    params: z.object({
        id: objectIdSchema,
    }),
});
