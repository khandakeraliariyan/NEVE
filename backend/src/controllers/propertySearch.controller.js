import Property from "../models/Property.js";
import { sendSuccess } from "../utils/apiResponse.js";
import { buildPagination, getPagination } from "../utils/pagination.js";
import {
  buildPropertySearchFilter,
  getPropertySort,
} from "../services/propertySearch.service.js";

export const searchProperties = async (req, res) => {
  try {
    const query = req.validated.query;
    const { page, limit, skip } = getPagination(query);
    const filter = buildPropertySearchFilter(query);

    const [properties, total] = await Promise.all([
      Property.find(filter)
        .populate("landlord", "displayName photoURL")
        .sort(getPropertySort(query.sort))
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
