/** biome-ignore-all lint/style/useConst: <explanation> */
import bcrypt from "bcryptjs";
import crypto from "crypto";
import ejs, { name } from "ejs";
import type { JwtPayload, SignOptions } from "jsonwebtoken";
import path from "path";
import {
  AuthProvider,
  Role,
  UserStatus,
} from "../../../generated/prisma/enums";
import config from "../../config";
import { googleClient } from "../../lib/googleAuth";
import { transporter } from "../../lib/nodemailer";
import { prisma } from "../../lib/prisma";
import { redisClient } from "../../lib/redis";
import { jwtUtils } from "../../utils/jwt";
import type {
  IForgotPasswordPayload,
  IGoogleLoginPayload,
  ILoginUserPayload,
  IRegisterPatientPayload,
  IRequestUser,
  IResetPasswordPayload,
} from "./auth.interface";
import { LoginTicket, OAuth2Client, TokenPayload } from "google-auth-library";
import { readSync } from "fs";
import { email } from "zod";

const registerPatient = async (payload: IRegisterPatientPayload) => {
  const { name, password, patient: patientData } = payload;

  const email = payload.email.trim().toLowerCase();

  const isUserExists = await prisma.user.findUnique({
    where: { email },
  });

  if (isUserExists) {
    throw new Error("User with this email already exists");
  }

  const hashedPassword = await bcrypt.hash(password, 8);

  const createdUser = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role: Role.PATIENT,
      status: UserStatus.ACTIVE,
      emailVerified: false,
      patient: {
        create: {
          name,
          email,
          contactNumber: patientData?.contactNumber || "",
        },
      },
    },
    omit: { password: true },
    include: { patient: true },
  });

  const { patient, ...user } = createdUser;
  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    user,
    patient,
    accessToken,
    refreshToken,
  };
};

const loginUser = async (payload: ILoginUserPayload) => {
  const { password } = payload;
  const email = payload.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (user.status === UserStatus.BLOCKED) {
    throw new Error("User is blocked");
  }

  if (user.isDeleted || user.status === UserStatus.DELETED) {
    throw new Error("User is deleted");
  }

  if (user.password === null && user.googleId !== null) {
    throw new Error(
      "User Already Has Account Registered With Google. Try To Login With Google.",
    );
  }

  const isPasswordMatched = await bcrypt.compare(
    password,
    user.password as string,
  );

  if (!isPasswordMatched) {
    throw new Error("Invalid credentials");
  }

  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    accessToken,
    refreshToken,
  };
};

const getMe = async (user: IRequestUser) => {
  const isUserExists = await prisma.user.findUnique({
    where: {
      id: user.userId,
    },
    include: {
      patient: true,
    },
    omit: {
      password: true,
    },
  });

  if (!isUserExists) {
    throw new Error("User not found");
  }

  return isUserExists;
};

const refreshToken = async (token: string) => {
  const verifiedRefreshToken = jwtUtils.verifyToken(
    token,
    config.jwt_refresh_secret,
  );

  if (!verifiedRefreshToken.success || !verifiedRefreshToken.data) {
    throw new Error(
      config.node_env === "development"
        ? verifiedRefreshToken.error
        : "Invalid refresh token",
    );
  }

  const data = verifiedRefreshToken.data as JwtPayload;

  const user = await prisma.user.findUnique({
    where: { id: data.userId },
  });

  if (!user || user.isDeleted || user.status !== UserStatus.ACTIVE) {
    throw new Error("User is inactive or not found");
  }

  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    accessToken,
    refreshToken,
  };
};

const googleLogin = async (payload: IGoogleLoginPayload) => {
  let googleIdTokenPayload = null;

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: payload.idToken,
      audience: config.google_client_id, // what does audience mean ?
    });
    googleIdTokenPayload = ticket.getPayload();
  } catch (error) {
    console.log("Google ID token verification failed !", error);
    throw new Error("Invalid or Expired google id token !");
  }

  if (!googleIdTokenPayload) {
    throw new Error("Invalid or Expired google id token !");
  }

  if (!googleIdTokenPayload.name) throw new Error("Google name not found");
  if (!googleIdTokenPayload.email) throw new Error("Google email not found");

  // find if the patient is authenticated via google
  const isPatientExistsWithGoogleAuth = await prisma.user.findUnique({
    where: {
      email: googleIdTokenPayload.email,
      role: Role.PATIENT,
      googleId: googleIdTokenPayload.sub,
    },
  });

  let user = isPatientExistsWithGoogleAuth;

  if (!isPatientExistsWithGoogleAuth) {
    const isPatientExistsWithCredential = await prisma.user.findUnique({
      where: {
        email: googleIdTokenPayload.email,
        role: Role.PATIENT,
        authProvider: AuthProvider.CREDENTIAL,
      },
    });

    if (isPatientExistsWithCredential) {
      if (isPatientExistsWithCredential.status === "BLOCKED") {
        throw new Error("User is blocked !");
      }

      if (
        isPatientExistsWithCredential.isDeleted ||
        isPatientExistsWithCredential.status === "DELETED"
      ) {
        throw new Error("User is deleted !");
      }

      user = await prisma.user.update({
        where: {
          id: isPatientExistsWithCredential.id,
        },
        data: {
          googleId: googleIdTokenPayload.sub,
        },
      });
    } else {
      user = await prisma.user.create({
        data: {
          name: googleIdTokenPayload.name,
          email: googleIdTokenPayload.email,
          role: Role.PATIENT,
          googleId: googleIdTokenPayload.sub,
          authProvider: AuthProvider.GOOGLE,
          patient: {
            create: {
              name: googleIdTokenPayload.name,
              email: googleIdTokenPayload.email,
            },
          },
        },
      });
    }
  }

  // if user doesn't exist in db, create new user via google auth
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: googleIdTokenPayload.name,
        email: googleIdTokenPayload.email,
        role: Role.PATIENT,
        googleId: googleIdTokenPayload.sub,
        authProvider: AuthProvider.GOOGLE,
        patient: {
          create: {
            name: googleIdTokenPayload.name,
            email: googleIdTokenPayload.email,
          },
        },
      },
    });
  }

  if (user.isDeleted || user.status === "DELETED") {
    throw new Error("User is deleted !");
  }

  if (user.status === "BLOCKED") {
    throw new Error("User is blocked !");
  }
  // user is now in DB, create JWT
  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    accessToken,
    refreshToken,
  };
};

const forgotPassword = async (payload: IForgotPasswordPayload) => {
  const { email } = payload;

  const isUserExists = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!isUserExists) {
    throw new Error("User does not exist.");
  }

  if (isUserExists.status === "BLOCKED") {
    throw new Error("User is blocked");
  }

  if (isUserExists.isDeleted || isUserExists.status === "DELETED") {
    throw new Error("User is deleted.");
  }

  if (isUserExists.googleId || isUserExists.authProvider !== "CREDENTIAL") {
    throw new Error("User has account with google.");
  }

  // main: Generate otp
  // ------------------------------

  const OTP = crypto.randomInt(100000, 1000000).toString();

  // explain suffix , prefix stuff shortly
  const key = `forgot-password-otp:${isUserExists.email}`;

  await redisClient.set(key, OTP, {
    expiration: {
      type: "EX",
      value: 5 * 60,
    },
  });

  const temaplatepath = path.join(
    process.cwd(),
    "src/app/templates/forgot-password.ejs",
  );

  const html = await ejs.renderFile(temaplatepath, {
    name: isUserExists.name,
    otp: OTP,
    expirationMinutes: 5,
  });

  await transporter.sendMail({
    from: config.email_sender,
    to: isUserExists.email,
    subject: "Forgot password.",
    html: html,
  });
};

const resetPassword = async (payload: IResetPasswordPayload) => {
  const { email, otp, newPassword } = payload;

  const isUserExists = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!isUserExists) {
    throw new Error("User does not exist.");
  }

  if (isUserExists.status === "BLOCKED") {
    throw new Error("User is blocked");
  }

  if (isUserExists.isDeleted || isUserExists.status === "DELETED") {
    throw new Error("User is deleted.");
  }

  if (isUserExists.googleId || isUserExists.authProvider !== "CREDENTIAL") {
    throw new Error("User has account with google.");
  }

  const key = `forgot-password-otp:${isUserExists.email}`;

  const redisOTP = await redisClient.get(key);

  if (!redisOTP) throw new Error("Invalid OTP");

  // otp --> from param
  if (redisOTP !== otp) {
    throw new Error("OTP does not match.");
  }

  const hasedNewPassword = await bcrypt.hash(
    newPassword,
    Number(config.bcrypt_salt_rounds),
  );

  const updateUser = await prisma.user.update({
    where: {
      email: isUserExists.email,
    },
    data: {
      password: hasedNewPassword,
    },
  });

  // password changed, delete otp from cache
  await redisClient.del([key]);

  const temaplatepath = path.join(
    process.cwd(),
    "src/app/templates/reset-password-success.ejs",
  );

  const html = await ejs.renderFile(temaplatepath, {
    name: isUserExists.name,
  });

  // send email 
  await transporter.sendMail({
    from: config.email_sender,
    to: isUserExists.email,
    subject: "Forgot password.",
    html: html,
  });
};

export const AuthService = {
  registerPatient,
  loginUser,
  getMe,
  refreshToken,
  googleLogin,
  forgotPassword,
  resetPassword,
};
