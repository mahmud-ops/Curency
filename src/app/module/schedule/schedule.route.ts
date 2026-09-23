import { Router } from "express";
import { ScheduleController } from "./schedule.controller";
import { auth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";
import { validateRequest } from "../../middleware/validateRequest";
import { CreateScheduleValidationZodSchema } from "./schedule.validation";

const router = Router();

router.post(
  "/create-schedule",
  auth(Role.DOCTOR),
  validateRequest(CreateScheduleValidationZodSchema),
  ScheduleController.createSchedule,
);

export const ScheduleRoutes = router;
