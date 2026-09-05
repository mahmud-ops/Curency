import { NextFunction, Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";

const bookAppointment = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: "Booked appointment successfully",
      data: null,
    });
  },
);

export const AppointmentControlller = {
  bookAppointment,
};
