import ViewingRequest from "../models/ViewingRequest.js";

// GET /api/v1/viewings/my-requests
export const getMyViewingRequests = async (req, res, next) => {
    try {
        const page = Number(req.query.page || 1);
        const limit = Number(req.query.limit || 10);
        const { status } = req.query;

        if (
            !Number.isInteger(page) ||
            page < 1 ||
            !Number.isInteger(limit) ||
            limit < 1 ||
            limit > 100
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid pagination values.",
            });
        }

        const filter = {
            renter: req.neveUser._id,
        };

        if (status) {
            filter.status = status;
        }

        const skip = (page - 1) * limit;

        const [requests, total] = await Promise.all([
            ViewingRequest.find(filter)
                .populate("property", "title address pricing images status")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),

            ViewingRequest.countDocuments(filter),
        ]);

        return res.status(200).json({
            success: true,
            data: requests,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        next(error);
    }
};

