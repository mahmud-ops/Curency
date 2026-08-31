import { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import httpStatus from "http-status";
import { sendResponse } from "../../utils/sendResponse";
import { userServices } from "./user.service";

const uploadProfileImage = catchAsync(async (req: Request, res: Response) => {
  const userId = req.user?.userId;

  let result = null;
  if (req.file?.buffer && userId) {
    result = await userServices.uploadProfileImage(req.file.buffer, userId);
  }

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Image uploaded successfully.",
    data: result,
  });
});

export const userController = {
  uploadProfileImage,
};
