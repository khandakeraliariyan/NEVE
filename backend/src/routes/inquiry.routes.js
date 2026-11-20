import { Router } from "../http/router.js";

import {
    createInquiry,
    getMyInquiries,
    getLandlordInquiries,
    updateInquiry,
} from "../controllers/inquiry.controller.js";

import {
    getLandlordInquiries as getNewLandlordInquiries,
    respondToInquiry,
} from "../controllers/landlordInquiry.controller.js";
import {
    getInquiryMessages,
    sendInquiryMessage,
} from "../controllers/inquiryMessage.controller.js";
import { reportInquiryMessage } from "../controllers/communicationReport.controller.js";

import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

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

export default router;