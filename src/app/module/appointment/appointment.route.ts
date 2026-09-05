import { Router } from "express";
import { AppointmentControlller } from "./appointment.controller";

const router = Router();

router.post("/book-appointment", AppointmentControlller.bookAppointment);

export const AppointmentRoutes = router;
