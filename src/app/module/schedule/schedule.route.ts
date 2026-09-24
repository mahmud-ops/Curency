import { Router } from "express";
import { ScheduleController } from "./schedule.controller";
import { auth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";
import { validateRequest } from "../../middleware/validateRequest";
import { CreateScheduleValidationZodSchema, UpdateScheduleValidationZodSchema } from "./schedule.validation";

const router = Router();

router.post(
  "/create-schedule",
  auth(Role.DOCTOR),
  validateRequest(CreateScheduleValidationZodSchema),
  ScheduleController.createSchedule,
);

router.get(
  "/my-schedules",
  auth(Role.DOCTOR),
  ScheduleController.getMySchedules,
);

router.get(
  "/all-schedules",
  auth(Role.ADMIN, Role.SUPER_ADMIN),
  ScheduleController.getAllSchedules,
);

router.get(
  "/:scheduleId",
  auth(Role.DOCTOR, Role.ADMIN, Role.SUPER_ADMIN),
  ScheduleController.getScheduleById,
);

router.patch(
    "/update-schedule/:scheduleId",
    auth(Role.DOCTOR),
    validateRequest(UpdateScheduleValidationZodSchema),
    ScheduleController.updateSchedule,
);

router.patch(
    "/publish-schedule/:scheduleId",
    auth(Role.DOCTOR),
    ScheduleController.publishSchedule,
);

router.delete(
    "/:scheduleId",
    auth(Role.DOCTOR),
    ScheduleController.deleteSchedule,
);

router.get("/todays-schedule", ScheduleController.getTodaysSchedules);

export const ScheduleRoutes = router;
