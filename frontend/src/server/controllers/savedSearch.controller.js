import mongoose from "mongoose";
import SavedSearch from "../models/SavedSearch.js";
import { normalizeSavedSearchInput } from "../services/savedSearch.service.js";

const userId = (req) => req.neveUser._id;
const maximumSavedSearches = 20;
const searchCriteria = [
    "query",
    "city",
    "area",
    "propertyType",
    "furnishing",
    "minRent",
    "maxRent",
    "minBedrooms",
    "maxBedrooms",
    "availableBy",
    "minLeaseDurationMonths",
    "maxLeaseDurationMonths",
    "amenities",
];

function getPagination(query) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 20);
    return Number.isInteger(page) &&
        page > 0 &&
        Number.isInteger(limit) &&
        limit > 0 &&
        limit <= 100
        ? { page, limit }
        : null;
}

export async function listSavedSearches(req, res, next) {
    try {
        const pagination = getPagination(req.query);
        if (!pagination) {
            return res.status(400).json({
                success: false,
                message: "Page must be positive and limit must be between 1 and 100.",
            });
        }
        const filter = { renter: userId(req) };
        const [data, total] = await Promise.all([
            SavedSearch.find(filter)
                .sort({ updatedAt: -1 })
                .skip((pagination.page - 1) * pagination.limit)
                .limit(pagination.limit)
                .lean(),
            SavedSearch.countDocuments(filter),
        ]);
        return res.json({
            success: true,
            data,
            pagination: {
                ...pagination,
                total,
                totalPages: Math.ceil(total / pagination.limit),
            },
        });
    } catch (error) {
        next(error);
    }
}

export async function createSavedSearch(req, res, next) {
    try {
        const { updates, error, fields } = normalizeSavedSearchInput(
            req.body ?? {}
        );
        if (error) {
            return res.status(400).json({
                success: false,
                message: error,
                ...(fields ? { fields } : {}),
            });
        }
        if (
            !searchCriteria.some((field) => {
                const value = updates[field];
                return Array.isArray(value) ? value.length > 0 : value != null && value !== "";
            })
        ) {
            return res.status(400).json({
                success: false,
                message: "Add at least one search criterion.",
            });
        }
        let savedSearch;
        for (let attempt = 0; attempt < maximumSavedSearches; attempt += 1) {
            const occupiedSlots = await SavedSearch.distinct("slot", {
                renter: userId(req),
            });
            const slot = Array.from(
                { length: maximumSavedSearches },
                (_, index) => index
            ).find((candidate) => !occupiedSlots.includes(candidate));
            if (slot === undefined) {
                return res.status(409).json({
                    success: false,
                    message: `A maximum of ${maximumSavedSearches} saved searches is allowed.`,
                });
            }
            try {
                savedSearch = await SavedSearch.create({
                    ...updates,
                    renter: userId(req),
                    slot,
                });
                break;
            } catch (error) {
                if (error.code !== 11000) throw error;
                const duplicateName = await SavedSearch.exists({
                    renter: userId(req),
                    name: updates.name,
                }).collation({ locale: "en", strength: 2 });
                if (duplicateName) {
                    return res.status(409).json({
                        success: false,
                        message: "A saved search with this name already exists.",
                    });
                }
            }
        }
        if (!savedSearch) {
            return res.status(409).json({
                success: false,
                message: "Could not reserve a saved-search slot. Please retry.",
            });
        }
        return res.status(201).json({
            success: true,
            message: "Saved search created.",
            data: savedSearch,
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "A saved search with this name already exists.",
            });
        }
        next(error);
    }
}

export async function getSavedSearch(req, res, next) {
    try {
        const { searchId } = req.params;
        if (!mongoose.isValidObjectId(searchId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid saved-search ID.",
            });
        }
        const savedSearch = await SavedSearch.findOne({
            _id: searchId,
            renter: userId(req),
        }).lean();
        if (!savedSearch) {
            return res.status(404).json({
                success: false,
                message: "Saved search not found.",
            });
        }
        return res.json({ success: true, data: savedSearch });
    } catch (error) {
        next(error);
    }
}

export async function updateSavedSearch(req, res, next) {
    try {
        const { searchId } = req.params;
        if (!mongoose.isValidObjectId(searchId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid saved-search ID.",
            });
        }
        const { updates, error, fields } = normalizeSavedSearchInput(
            req.body ?? {},
            { partial: true }
        );
        if (error) {
            return res.status(400).json({
                success: false,
                message: error,
                ...(fields ? { fields } : {}),
            });
        }
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: "Provide at least one supported field to update.",
            });
        }
        const savedSearch = await SavedSearch.findOne({
            _id: searchId,
            renter: userId(req),
        });
        if (!savedSearch) {
            return res.status(404).json({
                success: false,
                message: "Saved search not found.",
            });
        }
        const nextValues = { ...savedSearch.toObject(), ...updates };
        for (const [minimum, maximum] of [
            ["minRent", "maxRent"],
            ["minBedrooms", "maxBedrooms"],
            ["minLeaseDurationMonths", "maxLeaseDurationMonths"],
        ]) {
            if (
                nextValues[minimum] != null &&
                nextValues[maximum] != null &&
                nextValues[minimum] > nextValues[maximum]
            ) {
                return res.status(400).json({
                    success: false,
                    message: `${minimum} cannot exceed ${maximum}.`,
                });
            }
        }
        if (
            !searchCriteria.some((field) => {
                const value = nextValues[field];
                return Array.isArray(value)
                    ? value.length > 0
                    : value != null && value !== "";
            })
        ) {
            return res.status(400).json({
                success: false,
                message: "A saved search must have at least one search criterion.",
            });
        }
        Object.assign(savedSearch, updates);
        await savedSearch.save();
        return res.json({
            success: true,
            message: "Saved search updated.",
            data: savedSearch,
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: "A saved search with this name already exists.",
            });
        }
        next(error);
    }
}

export async function deleteSavedSearch(req, res, next) {
    try {
        const { searchId } = req.params;
        if (!mongoose.isValidObjectId(searchId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid saved-search ID.",
            });
        }
        const savedSearch = await SavedSearch.findOneAndDelete({
            _id: searchId,
            renter: userId(req),
        });
        if (!savedSearch) {
            return res.status(404).json({
                success: false,
                message: "Saved search not found.",
            });
        }
        return res.json({
            success: true,
            message: "Saved search deleted.",
        });
    } catch (error) {
        next(error);
    }
}
