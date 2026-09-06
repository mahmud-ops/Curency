import { Router } from "express";
import { AppointmentControlller } from "./appointment.controller";

const router = Router();

router.post("/book-appointment", AppointmentControlller.bookAppointment);

router.get(
  "/book-appointment/payment/callback",
  AppointmentControlller.appointCallback,
);

export const AppointmentRoutes = router;
