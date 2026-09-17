import { NextFunction, Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { DoctorService } from "./doctor.service";
import { sendResponse } from "../../utils/sendResponse";
import httpStatus from "http-status";
import { ApplyAsDoctorValidationZodSchema } from "./doctor.validation";
import { error } from "node:console";

const applyAsDoctor = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const files = req.files as {
      [filename: string]: Express.Multer.File[];
    };

    const resume = files?.resume?.[0] || null;
    const additionalFiles = files?.additionalFiles || [];

    const zodValidation = ApplyAsDoctorValidationZodSchema.safeParse(
      JSON.parse(req.body.data),
    );

    if (!zodValidation.success)
      throw new Error(zodValidation.error.issues[0].message);

    const data = zodValidation.data;

    const result = await DoctorService.applyAsDoctor(
      data,
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

const verifyDoctorEmail = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body;

  const result = await DoctorService.verifyDoctorEmail(payload);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Doctor Email Verified Successfully",
    data: result,
  });
});

const approveDoctor = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body;
  const user = req.user!;

  const result = await DoctorService.approveDoctor(payload, user);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Doctor Email Verified Successfully",
    data: result,
  });
});

const getAllDoctors = catchAsync(async (req: Request, res: Response) => {
	

	const {data, meta} = await DoctorService.getAllDoctors(req.query)
	sendResponse(res, {
		statusCode: httpStatus.OK,
		success: true,
		message: "Doctors Retrieved Successfully",
		data: data,
		meta : meta,
	});
});

export const DoctorController = {
  applyAsDoctor,
  verifyDoctorEmail,
  getAllDoctors
};
