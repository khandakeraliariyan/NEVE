// /api/v1/inquiries/...
import { Router } from "../../../../../server/http/router.js";

import {
    createInquiry,
    getMyInquiries,
    getLandlordInquiries,
    updateInquiry,
} from "../../../../../server/controllers/inquiry.controller.js";

import {
    getLandlordInquiries as getNewLandlordInquiries,
    respondToInquiry,
} from "../../../../../server/controllers/landlordInquiry.controller.js";
import {
    getInquiryMessages,
    sendInquiryMessage,
} from "../../../../../server/controllers/inquiryMessage.controller.js";
import { reportInquiryMessage } from "../../../../../server/controllers/communicationReport.controller.js";

import { authenticateUser } from "../../../../../server/middleware/auth.middleware.js";
import { allowRoles } from "../../../../../server/middleware/role.middleware.js";
import { apiRoutes } from "../../../../../server/http/route.js";

const router = Router();

// Renter routes
router.post(
    "/",
    authenticateUser,
    allowRoles("renter"),
    createInquiry
);

router.get(
    "/mine",
    authenticateUser,
    allowRoles("renter"),
    getMyInquiries
);

router.get(
    "/:inquiryId/messages",
    authenticateUser,
    allowRoles("renter", "landlord"),
    getInquiryMessages
);

router.post(
    "/:inquiryId/messages",
    authenticateUser,
    allowRoles("renter", "landlord"),
    sendInquiryMessage
);

router.post(
    "/:inquiryId/messages/:messageId/report",
    authenticateUser,
    allowRoles("renter", "landlord"),
    reportInquiryMessage
);

// Landlord routes
router.get(
    "/landlord",
    authenticateUser,
    allowRoles("landlord"),
    getNewLandlordInquiries
);

router.patch(
    "/:inquiryId/respond",
    authenticateUser,
    allowRoles("landlord"),
    respondToInquiry
);

router.get(
    "/received",
    authenticateUser,
    allowRoles("landlord"),
    getLandlordInquiries
);

router.patch(
    "/:id",
    authenticateUser,
    allowRoles("landlord"),
    updateInquiry
);


const handler = apiRoutes([{ prefix: "/api/v1/inquiries", router }]);

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const HEAD = handler;
