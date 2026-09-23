import { NextFunction, Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { scheduleService } from "./schedule.service";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";
import { CreateScheduleValidationZodSchema } from "./schedule.validation";
import { AppError } from "../../utils/AppError";

const createSchedule = catchAsync(async (req: Request, res: Response) => {
    const payload = req.body;
    const user = req.user!;

    const result = await scheduleService.createSchedule(payload, user);
    sendResponse(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: "Schedule Created Successfully",
        data: result,
    });
});

export const ScheduleController = {
  createSchedule,
};