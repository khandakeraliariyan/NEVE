import Property from "../models/Property.js";

const escapeRegex = (value) =>
  value.replace(/[.*+^${}()|[\]\\]/g, "\\$&");

const allowedSorts = {
  rent_asc: { "pricing.monthlyRent": 1 },
  rent_desc: { "pricing.monthlyRent": -1 },
  newest: { createdAt: -1 },
};

export const searchProperties = async (req, res) => {
  try {
    const {
      city,
      area,
      propertyType,
      minRent,
      maxRent,
      bedrooms,
      sort = "newest",
    } = req.query;

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
        message: "page must be positive; limit must be between 1 and 50.",
      });
    }

    if (!allowedSorts[sort]) {
      return res.status(400).json({
        message: "Invalid sort option. Use rent_asc, rent_desc, or newest.",
      });
    }

    const min = minRent === undefined ? undefined : Number(minRent);
    const max = maxRent === undefined ? undefined : Number(maxRent);
    const beds =
      bedrooms === undefined ? undefined : Number(bedrooms);

    if (
      (min !== undefined && (!Number.isFinite(min) || min < 0)) ||
      (max !== undefined && (!Number.isFinite(max) || max < 0)) ||
      (min !== undefined && max !== undefined && min > max)
    ) {
      return res.status(400).json({
        message: "Invalid rent range.",
      });
    }

    if (
      beds !== undefined &&
      (!Number.isInteger(beds) || beds < 0)
    ) {
      return res.status(400).json({
        message: "bedrooms must be a non-negative integer.",
      });
    }

    const filter = { status: "published" };

    if (city) {
      filter["address.city"] = {
        $regex: escapeRegex(String(city).trim()),
        $options: "i",
      };
    }

    if (area) {
      filter["address.area"] = {
        $regex: escapeRegex(String(area).trim()),
        $options: "i",
      };
    }

    if (propertyType) {
      filter.propertyType = String(propertyType).trim();
    }

    if (min !== undefined || max !== undefined) {
      filter["pricing.monthlyRent"] = {};

      if (min !== undefined) {
        filter["pricing.monthlyRent"].$gte = min;
      }

      if (max !== undefined) {
        filter["pricing.monthlyRent"].$lte = max;
      }
    }

    if (beds !== undefined) {
      filter.bedrooms = beds;
    }

    const skip = (page - 1) * limit;

    const [properties, total] = await Promise.all([
      Property.find(filter)
        .sort(allowedSorts[sort])
        .skip(skip)
        .limit(limit)
        .lean(),

      Property.countDocuments(filter),
    ]);

    return res.status(200).json({
      message: "Properties retrieved successfully.",
      filters: {
        city: city || null,
        area: area || null,
        propertyType: propertyType || null,
        minRent: min ?? null,
        maxRent: max ?? null,
        bedrooms: beds ?? null,
        sort,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPreviousPage: page > 1,
      },
      results: properties,
    });
  } catch (error) {
    console.error("Property search error:", error);

    return res.status(500).json({
      message: "Could not search properties.",
    });
  }
};
