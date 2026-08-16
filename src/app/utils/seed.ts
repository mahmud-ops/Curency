import bcrypt from "bcryptjs";
import { Role } from "../../generated/prisma/enums";
import { prisma } from "../lib/prisma";
import config from "../config";

export const seedSuperAdmin = async () => {
  try {
    const isSuperAdminExist = await prisma.user.findFirst({
      where: {
        role: Role.SUPER_ADMIN,
      },
    });

    if (isSuperAdminExist) {
      console.log("Super admin already exists");
      return;
    }

    const name = config.super_admin_name as string;
    const email = config.super_admin_email as string;
    const password = config.super_admin_password as string;

    if (!name || !email || !password) {
      throw new Error(
        "Super admin name / email / password is missing in .env file",
      );
    }

    const hashedPassword = await bcrypt.hash(
      password,
      Number(config.bcrypt_salt_rounds),
    );

    const superAdmin = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: Role.SUPER_ADMIN,
        needPasswordChange: false,
        emailVerified: true,
      },
    });

    console.log("Super admin created", superAdmin);
  } catch (error) {
    console.log("Error seeding super admin: ", error);
  }
};

export const seedTesterAdmin = async () => {
  try {
    const isTesterAdminExist = await prisma.user.findFirst({
      where: {
        email: config.tester_admin_email as string,
      },
    });

    if (isTesterAdminExist) {
      console.log("Tester admin already exists");
      return;
    }

    const name = config.tester_admin_name as string;
    const email = config.tester_admin_email as string;
    const password = config.tester_admin_password as string;

    if (!name || !email || !password) {
      throw new Error(
        "Tester admin name / email / password is missing in .env file",
      );
    }

    const hashedPassword = await bcrypt.hash(
      password,
      Number(config.bcrypt_salt_rounds),
    );

    const testerAdmin = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: Role.ADMIN,
        needPasswordChange: false,
        emailVerified: true,
      },
    });

    console.log("Tester admin created", testerAdmin);
  } catch (error) {
    console.log("Error seeding tester admin: ", error);
  }
};

export const seedTesterDoctor = async () => {
  try {
    const isTesterDoctorExist = await prisma.user.findFirst({
      where: {
        email: config.tester_doctor_email as string,
      },
    });

    if (isTesterDoctorExist) {
      console.log("Tester doctor already exists");
      return;
    }

    const name = config.tester_doctor_name as string;
    const email = config.tester_doctor_email as string;
    const password = config.tester_doctor_password as string;

    if (!name || !email || !password) {
      throw new Error(
        "Tester doctor name / email / password is missing in .env file",
      );
    }

    const hashedPassword = await bcrypt.hash(
      password,
      Number(config.bcrypt_salt_rounds),
    );

    const testerDoctor = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role: Role.DOCTOR,
        needPasswordChange: false,
        emailVerified: true,
      },
    });

    console.log("Tester doctor created", testerDoctor);
  } catch (error) {
    console.log("Error seeding tester doctor: ", error);
  }
};
