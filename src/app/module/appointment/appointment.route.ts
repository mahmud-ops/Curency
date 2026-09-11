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

router.get(
  "/book-appointment/payment/callback",
  AppointmentControlller.appointCallback,
);

export const AppointmentRoutes = router;
