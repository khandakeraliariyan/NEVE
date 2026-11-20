import { Router } from "../http/router.js";
import { checkDuplicateListings } from "../controllers/duplicateListing.controller.js";
import { authenticateUser } from "../middleware/auth.middleware.js";
import { allowRoles } from "../middleware/role.middleware.js";

const router = Router();

router.get(
  "/:propertyId/duplicate-check",
  authenticateUser,
  allowRoles("admin"),
  checkDuplicateListings
);

export default router;
