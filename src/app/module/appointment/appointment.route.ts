import { Router } from "express";
import { AppointmentControlller } from "./appointment.controller";
import { auth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";

const router = Router();

router.post(
  "/book-appointment",
  auth(Role.PATIENT),
  AppointmentControlller.bookAppointment,
);

router.post(
  "/pay-appointment",
  auth(Role.PATIENT),
  AppointmentControlller.payAppointment,
);

router.post(
  "/cancel-appointment",
  auth(Role.PATIENT, Role.ADMIN, Role.SUPER_ADMIN),
  AppointmentControlller.cancelAppointment,
);

router.get(
  "/book-appointment/payment/callback",
  AppointmentControlller.appointCallback,
);

export const AppointmentRoutes = router;
