import { Router } from "express";
import { userController } from "./user.controller";
import { upload } from "../../lib/multer";
import { Role } from "../../../generated/prisma/enums";
import { auth } from "../../middleware/checkAuth";

const router = Router();

router.patch(
  "/profile-image",
  auth(Role.ADMIN, Role.DOCTOR, Role.PATIENT, Role.SUPER_ADMIN),
  upload.single("profile_image"), // the field name ("profile_image") should be same as the frontend form key
  userController.uploadProfileImage,
);

export const UserRoutes = router;
