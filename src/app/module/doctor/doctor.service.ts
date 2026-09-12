import { UploadApiResponse } from "cloudinary";
import { prisma } from "../../lib/prisma";
import { cloudinary } from "../../lib/cloudinary";
import { create } from "node:domain";
import bcrypt from "bcryptjs";
import { Role } from "../../../generated/prisma/enums";

const applyAsDoctor = async (
  payload: any,
  resume: Express.Multer.File | null,
  additionalFiles: Express.Multer.File[],
) => {
  console.log(payload.user.email);
  const isUserExist = await prisma.doctor.findUnique({
    where: {
      email: payload.user.email,
    },
  });

  if (isUserExist) throw new Error("User already exists with this email.");

  const resumeUploadResult = await new Promise<UploadApiResponse>(
    (resolve, reject) => {
      cloudinary.uploader
        .upload_stream({ resource_type: "auto" }, (error, result) => {
          if (error) {
            reject(error);
            return;
          }

          if (!result) {
            reject(new Error("Cloudinary upload failed"));
            return;
          }

          resolve(result);
        })
        .end(resume?.buffer);
    },
  );

  const additionalFilesUploadResult = await Promise.all(
    additionalFiles.map((file) => {
      // since array, we have to upload one by one ( map )
      return new Promise<UploadApiResponse>((resolve, reject) => {
        cloudinary.uploader
          .upload_stream({ resource_type: "auto" }, (error, result) => {
            if (error) {
              reject(error);
              return;
            }

            if (!result) {
              reject(new Error("Cloudinary upload failed"));
              return;
            }

            resolve(result);
          })
          .end(file.buffer);
      });
    }),
  );

  const password = Math.random().toString(36).slice(-8);
  const hashedPassword = await bcrypt.hash(password, 10);

  const doctorApplication = await prisma.user.create({
    data: {
      ...payload.user,
      password: hashedPassword,
      role: Role.DOCTOR,
      needPasswordChange: true,
      doctor: {
        create: {
          name: payload.user.name,
          email: payload.user.email,
          ...payload.doctor,
          resume: resumeUploadResult.secure_url,
          resumePublicId: resumeUploadResult.public_id,
          additionalFiles: additionalFilesUploadResult.map((file) => ({
            url: file.secure_url,
            publicId: file.public_id,
          })),
        },
      },
    },
    include: {
      doctor: true,
    },
  });

  

  return doctorApplication;
};

export const DoctorService = {
  applyAsDoctor,
};
