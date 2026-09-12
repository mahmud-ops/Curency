import { UploadApiResponse } from "cloudinary";
import { prisma } from "../../lib/prisma";
import { cloudinary } from "../../lib/cloudinary";
import bcrypt from "bcryptjs";
import { Role } from "../../../generated/prisma/enums";
import crypto from "crypto";
import { redisClient } from "../../lib/redis";
import path from "path";
import ejs from "ejs";
import { transporter } from "../../lib/nodemailer";
import config from "../../config";

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

  // Store otp in redis and the send the otp via email -- start
  const expirationSeconds = 60 * 60;
  const otpKey = `doctorapplication:otp:${payload.user.email}`;

  const otpValue = crypto.randomInt(100000, 1000000).toString();
  await redisClient.set(otpKey, otpValue, {
    expiration: {
      type: "EX",
      value: expirationSeconds,
    },
  });

  const temaplatepath = path.join(
    process.cwd(),
    "src/app/templates/register-user-otp.ejs",
  );

  const html = await ejs.renderFile(temaplatepath, {
    name,
    otp: otpValue,
    expirationMinutes: expirationSeconds / 60,
  });

  await transporter.sendMail({
    from: config.email_sender,
    to: payload.user.email,
    subject: "Email verification.",
    html: html,
  });
  // Store otp in redis and the send the otp via email -- end

  return doctorApplication;
};

const verifyDoctorEmail = async () => {};

export const DoctorService = {
  applyAsDoctor,
  verifyDoctorEmail
};
