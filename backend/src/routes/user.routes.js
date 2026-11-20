import { Router } from "../http/router.js";

import {
    createProfile,
    getMyProfile,
    updateMyProfile,
    lookupUsers,
    getPublicProfile,
} from "../controllers/user.controller.js";

import {
    getProfilePhoto,
    removeMyProfilePhoto,
    setMyProfilePhoto,
} from "../controllers/profilePhoto.controller.js";

import {
    getMyLoginHistory,
    getMySessions,
    revokeMyOtherSessions,
    revokeMySession,
} from "../controllers/sessions.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles, allowSuspendedRoles } from "../middleware/role.middleware.js";
import { getMyAppeals, submitAppeal } from "../controllers/accountAppeal.controller.js";

import {
    addFavorite,
    getFavorites,
    removeFavorite,
} from "../controllers/favorite.controller.js";

import {
    recordPropertyView,
    getRecentlyViewed,
    clearRecentlyViewed,
    removeRecentlyViewed,
} from "../controllers/recentlyViewed.controller.js";

const router = Router();

router.post("/profile", authenticateUser, createProfile);
router.get("/me", authenticateUser, getMyProfile);
router.patch("/me", authenticateUser, updateMyProfile);
router.put("/me/photo", authenticateUser, setMyProfilePhoto);
router.delete("/me/photo", authenticateUser, removeMyProfilePhoto);

const anyRole = allowRoles("renter", "landlord", "legal_reviewer", "admin");
router.get("/me/sessions", authenticateUser, anyRole, getMySessions);
router.post("/me/sessions/revoke-others", authenticateUser, anyRole, revokeMyOtherSessions);
router.delete("/me/sessions/:sessionId", authenticateUser, anyRole, revokeMySession);
router.get("/me/login-history", authenticateUser, anyRole, getMyLoginHistory);
// Appeals and account complaints; reachable while the account is suspended.
const appellant = allowSuspendedRoles("renter", "landlord", "legal_reviewer");
router.get("/me/appeals", authenticateUser, appellant, getMyAppeals);
router.post("/me/appeals", authenticateUser, appellant, submitAppeal);

router.get(
    "/lookup",
    authenticateUser,
    allowRoles("renter", "landlord"),
    lookupUsers
);

router.post(
    "/me/favorites/:propertyId",
    authenticateUser,
    allowRoles("renter"),
    addFavorite
);

router.get(
    "/me/favorites",
    authenticateUser,
    allowRoles("renter"),
    getFavorites
);

router.delete(
    "/me/favorites/:propertyId",
    authenticateUser,
    allowRoles("renter"),
    removeFavorite
);

router.post(
    "/me/recently-viewed/:propertyId",
    authenticateUser,
    allowRoles("renter"),
    recordPropertyView
);

router.get(
    "/me/recently-viewed",
    authenticateUser,
    allowRoles("renter"),
    getRecentlyViewed
);

router.delete(
    "/me/recently-viewed/:propertyId",
    authenticateUser,
    allowRoles("renter"),
    removeRecentlyViewed
);

router.delete(
    "/me/recently-viewed",
    authenticateUser,
    allowRoles("renter"),
    clearRecentlyViewed
);

// Public, so other users' photos can be shown; registered last so it never
// shadows a /me route.
router.get("/:userId/photo", getProfilePhoto);
router.get("/:userId/public", getPublicProfile);

export default router;