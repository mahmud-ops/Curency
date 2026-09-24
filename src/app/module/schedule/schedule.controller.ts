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

const getMySchedules = catchAsync(async (req: Request, res: Response) => {
  const user = req.user!;

  const { data, meta } = await scheduleService.getMySchedule(req.query, user);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Schedules Retrieved Successfully",
    data,
    meta,
  });
});

const getAllSchedules = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await scheduleService.getAllSchedules(req.query);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Schedules Retrieved Successfully",
    data,
    meta,
  });
});

const getScheduleById = catchAsync(async (req: Request, res: Response) => {
  const scheduleId = req.params.scheduleId as string;

  const result = await scheduleService.getScheduleById(scheduleId);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Schedule Retrieved Successfully",
    data: result,
  });
});

const updateSchedule = catchAsync(async (req: Request, res: Response) => {
  const scheduleId = req.params.scheduleId as string;
  const payload = req.body;
  const user = req.user!;

  const result = await scheduleService.updateSchedule(
    scheduleId,
    payload,
    user,
  );
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Schedule Updated Successfully",
    data: result,
  });
});

const publishSchedule = catchAsync(async (req: Request, res: Response) => {
  const scheduleId = req.params.scheduleId as string;
  const user = req.user!;

  const result = await scheduleService.publishSchedule(scheduleId, user);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Schedule Published Successfully",
    data: result,
  });
});

const deleteSchedule = catchAsync(async (req: Request, res: Response) => {
  const scheduleId = req.params.scheduleId as string;
  const user = req.user!;

  const result = await scheduleService.deleteSchedule(scheduleId, user);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Schedule Deleted Successfully",
    data: result,
  });
});

const getTodaysSchedules = catchAsync(async (req: Request, res: Response) => {
  const { data, meta } = await scheduleService.getTodaysSchedules(req.query);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Today's Schedules Retrieved Successfully",
    data,
    meta,
  });
});

export const ScheduleController = {
  createSchedule,
  getMySchedules,
  getAllSchedules,
  getScheduleById,
  updateSchedule,
  publishSchedule,
  deleteSchedule,
  getTodaysSchedules,
};
