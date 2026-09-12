import { NextFunction, Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { DoctorService } from "./doctor.service";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";

const applyAsDoctor = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const files = req.files as { [filename: string]: Express.Multer.File[] };

    const resume = files?.resume?.[0] || null;
    const additionalFiles = files?.additionalFiles || [];
    const data = req.body.data;

    console.log({
      resume,
      additionalFiles,
      data,
    });

    const result = await DoctorService.applyAsDoctor(
      req.body,
      resume,
      additionalFiles,
    );

    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: "Applied as a doctor successfully.",
      data: result,
    });
  },
);

export const DoctorController = {
  applyAsDoctor,
};
