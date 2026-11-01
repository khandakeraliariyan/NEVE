import express from "express";
import {
    createSavedSearch,
    deleteSavedSearch,
    getSavedSearch,
    listSavedSearches,
    updateSavedSearch,
} from "../controllers/savedSearch.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = express.Router();

router.use((req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
});
router.use(authenticateUser, allowRoles("renter"));

router.get("/", listSavedSearches);
router.post("/", createSavedSearch);
router.get("/:searchId", getSavedSearch);
router.patch("/:searchId", updateSavedSearch);
router.delete("/:searchId", deleteSavedSearch);

export default router;
