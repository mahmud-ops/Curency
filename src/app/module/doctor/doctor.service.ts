import { UploadApiResponse } from "cloudinary";
import { prisma } from "../../lib/prisma";
import { cloudinary } from "../../lib/cloudinary";
import bcrypt from "bcryptjs";
import {
  DoctorVerificationStatus,
  Role,
} from "../../../generated/prisma/enums";
import crypto from "crypto";
import { redisClient } from "../../lib/redis";
import path from "path";
import ejs from "ejs";
import { transporter } from "../../lib/nodemailer";
import config from "../../config";
import {
  IApplyAsDoctorPayload,
  IApproveDoctorPayload,
  IVerifyDoctorEmailPayload,
} from "./doctor.interface";
import { RequestUser } from "../../middleware/checkAuth";
import { DoctorWhereInput } from "../../../generated/prisma/models";
import { IQuery } from "../../interfaces";

const applyAsDoctor = async (
  payload: IApplyAsDoctorPayload,
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
  const otpKey = `doctor-application-otp:${payload.user.email}`;

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

const verifyDoctorEmail = async (payload: IVerifyDoctorEmailPayload) => {
  const otp = payload.otp;
  const email = payload.email.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({
    where: { email, role: Role.DOCTOR },
  });

  if (!existingUser) {
    throw new Error("Doctor Application Not Found. Please Apply Again.");
  }

  if (existingUser.emailVerified) {
    throw new Error("Email Already Verified");
  }

  const otpKey = `doctor-application-otp:${email}`;

  const redisOtp = await redisClient.get(otpKey);

  if (!redisOtp) {
    throw new Error(
      "OTP Expired. Your Application Window Has Closed, Please Apply Again.",
    );
  }

  if (redisOtp !== otp) {
    throw new Error("OTP Does Not Match");
  }

  await redisClient.del(otpKey);

  const verifiedUser = await prisma.user.update({
    where: { id: existingUser.id },
    data: { emailVerified: true },
    omit: { password: true },
    include: { doctor: true },
  });

  return verifiedUser;
};

const approveDoctor = async (
  payload: IApproveDoctorPayload,
  reviewer: RequestUser,
) => {
  const { doctorId, verificationStatus, rejectionReason } = payload;

  const existingDoctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    include: { user: true },
  });

  if (!existingDoctor) {
    throw new Error("Doctor Application Not Found");
  }

  if (existingDoctor.isDeleted) {
    throw new Error("Doctor Application Has Been Deleted");
  }

  if (!existingDoctor.user.emailVerified) {
    throw new Error(
      "Doctor Has Not Verified Their Email Yet. Application Cannot Be Reviewed.",
    );
  }

  if (existingDoctor.verificationStatus !== DoctorVerificationStatus.PENDING) {
    throw new Error(
      `Doctor Application Has Already Been ${existingDoctor.verificationStatus.toLowerCase()}`,
    );
  }

  if (
    verificationStatus === DoctorVerificationStatus.REJECTED &&
    !rejectionReason
  ) {
    throw new Error(
      "Rejection Reason Is Required When Rejecting A Doctor Application",
    );
  }

  const updatedDoctor = await prisma.doctor.update({
    where: { id: doctorId },
    data: {
      verificationStatus,
      rejectionReason:
        verificationStatus === DoctorVerificationStatus.REJECTED
          ? rejectionReason
          : null,
      reviewedBy: reviewer.userId,
      reviewedAt: new Date(),
    },
  });

  const isApproved = verificationStatus === DoctorVerificationStatus.APPROVED;

  const tempatePath = path.join(
    process.cwd(),
    `src/app/templates/${
      isApproved
        ? "doctor-application-approved.ejs"
        : "doctor-application-rejected.ejs"
    }`,
  );

  const templateData = {
    name: updatedDoctor.name,
    reason: updatedDoctor.rejectionReason,
  };

  const html = await ejs.renderFile(tempatePath, templateData);

  await transporter.sendMail({
    from: config.email_sender,
    to: updatedDoctor.email,
    subject: isApproved
      ? "Your Doctor Application Has Been Approved"
      : "Your Doctor Application Has Been Rejected",
    html,
  });

  return updatedDoctor;
};

const getAllDoctors = async (query: IQuery) => {
  const limit = query.limit ? Number(query.limit) : 10;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;

  const sortBy = query.sortBy ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder ? query.sortOrder : "desc";

  const andConditions: DoctorWhereInput[] = [];

  // searching
  if (query.searchTerm) {
    andConditions.push({
      OR: [
        { name: { contains: query.searchTerm, mode: "insensitive" } },
        { email: { contains: query.searchTerm, mode: "insensitive" } },
        { specialization: { contains: query.searchTerm, mode: "insensitive" } },
        { licenseNumber: { contains: query.searchTerm, mode: "insensitive" } },
      ],
    });
  }

  // filtering
  if (query.specialization) {
    andConditions.push({
      specialization: {
        equals: query.specialization,
        mode: "insensitive",
      },
    });
  }

  if (query.email) {
    andConditions.push({
      email: { contains: query.email, mode: "insensitive" },
    });
  }

  if (query.licenseNumber) {
    andConditions.push({
      licenseNumber: { equals: query.licenseNumber, mode: "insensitive" },
    });
  }

  if (query.verificationStatus) {
    andConditions.push({
      verificationStatus: query.verificationStatus as DoctorVerificationStatus,
    });
  }

  andConditions.push({ isDeleted: false }); // only show those which are not deleted

  // ---

  const allDoctors = await prisma.doctor.findMany({
    where: {
      AND: andConditions.length > 0 ? andConditions : undefined,
    },

    take: limit,
    skip: skip,

    orderBy: {
      [sortBy]: sortOrder,
    },

    include: {
      user: {
        omit: {
          password: true,
        },
      },
    },
  });

  const totalDoctorsCount = await prisma.doctor.count({
    where: {
      AND: andConditions,
    },
  });

  return {
    data: allDoctors,
    meta: {
      page: page,
      limit: limit,
      total: totalDoctorsCount,
      totalPages: Math.ceil(totalDoctorsCount / limit),
    },
  };
};

export const DoctorService = {
  applyAsDoctor,
  verifyDoctorEmail,
  approveDoctor,
  getAllDoctors
};
