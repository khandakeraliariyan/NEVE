import Property from "../models/Property.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { buildPagination, getPagination } from "../utils/pagination.js";

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
      sort,
    } = req.validated.query;
    const { page, limit, skip } = getPagination(req.validated.query);

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

    const [properties, total] = await Promise.all([
      Property.find(filter)
        .sort(allowedSorts[sort])
        .skip(skip)
        .limit(limit)
        .lean(),

      Property.countDocuments(filter),
    ]);

    return sendSuccess(res, {
      message: "Properties retrieved successfully.",
      data: properties,
      pagination: buildPagination({
        page,
        limit,
        total,
      }),
    });
  } catch (error) {
    console.error("Property search error:", error);

    return res.status(500).json({
      message: "Could not search properties.",
    });
  }
};
