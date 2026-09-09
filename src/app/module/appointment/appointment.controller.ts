import { NextFunction, Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";
import { AppointmentService } from "./appointment.service";

const bookAppointment = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const payload = req.body;
    const user = req.user!;

    const result = await AppointmentService.bookAppointment(payload, user);
    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: "Booked appointment successfully",
      data: result,
    });
  },
);

const appointCallback = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { executeBkashPayment, redirectUrl } =
      await AppointmentService.bookAppointmentCallback(req.query);

    res.redirect(redirectUrl);
  },
);

export const AppointmentControlller = {
  bookAppointment,
  appointCallback,
};
