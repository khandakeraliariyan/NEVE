import { Router } from "express";

import {
    createProfile,
    getMyProfile,
} from "../controllers/user.controller.js";

import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

import {
    addFavorite,
    getFavorites,
    removeFavorite,
} from "../controllers/favorite.controller.js";

const router = Router();

router.post("/profile", authenticateUser, createProfile);
router.get("/me", authenticateUser, getMyProfile);

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

export default router;