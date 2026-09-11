import { NextFunction, Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";
import { AppointmentService } from "./appointment.service";
import strict from "node:assert/strict";

const bookAppointment = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const payload = req.body;
    const user = req.user!;

    const result = await AppointmentService.bookAppointment(payload, user);
    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: "Appoinment payment initiated successfully.",
      data: result,
    });
  },
);

const appointCallback = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { redirectUrl } = await AppointmentService.bookAppointmentCallback(
      req.query,
    );

    res.redirect(redirectUrl);
  },
);

const payAppointment = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const payload = req.body;
    const user = req.user!;

    const result = await AppointmentService.payAppointment(payload, user);
    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: "Appoinment payment initiated successfully.",
      data: result,
    });
  },
);

const cancelAppointment = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const payload = req.body;
    const user = req.user!;

    const result = await AppointmentService.cancelAppointment(payload, user);
    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: "Appoinment cancelled and refunded successfully.",
      data: result,
    });
  },
);

export const AppointmentControlller = {
  bookAppointment,
  appointCallback,
  payAppointment,
  cancelAppointment,
};
