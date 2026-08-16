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
