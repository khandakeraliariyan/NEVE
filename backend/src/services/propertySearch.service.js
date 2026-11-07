const SORT_OPTIONS = {
    rent_asc: { "pricing.monthlyRent": 1, _id: 1 },
    rent_desc: { "pricing.monthlyRent": -1, _id: 1 },
    newest: { createdAt: -1, _id: -1 },
    oldest: { createdAt: 1, _id: 1 },
};

const escapeRegex = (value) =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function buildPropertySearchFilter(query = {}) {
    const filter = { status: "published" };

    for (const field of ["city", "area"]) {
        const value = query[field]?.trim();

        if (value) {
            filter[`address.${field}`] = {
                $regex: escapeRegex(value),
                $options: "i",
            };
        }
    }

    if (query.propertyType) {
        filter.propertyType = query.propertyType;
    }

    // Shared-accommodation filters. "any" listings suit every renter, so a
    // gender filter also includes them.
    if (query.occupantGender) {
        filter["sharedAccommodation.occupantGender"] =
            query.occupantGender === "any"
                ? "any"
                : { $in: [query.occupantGender, "any"] };
    }

    if (query.bathroomType) {
        filter["sharedAccommodation.bathroomType"] = query.bathroomType;
    }

    if (query.minAvailableSpots !== undefined) {
        filter["sharedAccommodation.availableSpots"] = {
            $gte: query.minAvailableSpots,
        };
    }

    if (query.furnishing) {
        filter.furnishing = query.furnishing;
    }

    if (
        query.bedrooms !== undefined ||
        query.maxBedrooms !== undefined
    ) {
        filter.bedrooms = {};

        if (query.bedrooms !== undefined) {
            filter.bedrooms.$gte = query.bedrooms;
        }

        if (query.maxBedrooms !== undefined) {
            filter.bedrooms.$lte = query.maxBedrooms;
        }
    }

    if (query.minRent !== undefined || query.maxRent !== undefined) {
        filter["pricing.monthlyRent"] = {};

        if (query.minRent !== undefined) {
            filter["pricing.monthlyRent"].$gte = query.minRent;
        }

        if (query.maxRent !== undefined) {
            filter["pricing.monthlyRent"].$lte = query.maxRent;
        }
    }

    if (query.availableBy) {
        filter.availabilityDate = { $lte: query.availableBy };
    }

    if (
        query.minLeaseDurationMonths !== undefined ||
        query.maxLeaseDurationMonths !== undefined
    ) {
        filter.leaseDurationMonths = {};

        if (query.minLeaseDurationMonths !== undefined) {
            filter.leaseDurationMonths.$gte =
                query.minLeaseDurationMonths;
        }

        if (query.maxLeaseDurationMonths !== undefined) {
            filter.leaseDurationMonths.$lte =
                query.maxLeaseDurationMonths;
        }
    }

    if (query.amenities?.length) {
        filter.amenities = { $all: [...new Set(query.amenities)] };
    }

    if (query.q) {
        const searchPattern = new RegExp(
            escapeRegex(query.q.trim()),
            "i"
        );

        filter.$or = [
            { title: searchPattern },
            { description: searchPattern },
            { "address.area": searchPattern },
            { "address.city": searchPattern },
        ];
    }

    return filter;
}

export function getPropertySort(sort = "newest") {
    return SORT_OPTIONS[sort] ?? SORT_OPTIONS.newest;
}
