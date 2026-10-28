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
      page,
      limit,
      sort,
    } = req.validated.query;

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

    if (minRent !== undefined || maxRent !== undefined) {
      filter["pricing.monthlyRent"] = {};

      if (minRent !== undefined) {
        filter["pricing.monthlyRent"].$gte = minRent;
      }

      if (maxRent !== undefined) {
        filter["pricing.monthlyRent"].$lte = maxRent;
      }
    }

    if (bedrooms !== undefined) {
      filter.bedrooms = bedrooms;
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
        minRent: minRent ?? null,
        maxRent: maxRent ?? null,
        bedrooms: bedrooms ?? null,
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
