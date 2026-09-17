import cron from "node-cron";
import { prisma } from "./prisma";
import { DoctorVerificationStatus, Role } from "../../generated/prisma/enums";

export const deleteUnverifiedDoctors = async () => {
  cron.schedule("*/10 * * * *", async () => {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000); // get time from one hour before right now
      const deletedDoctors = await prisma.user.deleteMany({
        where: {
          role: Role.DOCTOR,
          emailVerified: false,
          createdAt: { lt: oneHourAgo }, // lt : less than | Find doctors whose account was created before one hour ago.
          doctor: {
            verificationStatus: DoctorVerificationStatus.PENDING,
          },
        },
      });

      if (deletedDoctors.count > 0) {
        console.log(
          `Cron: Deleeted ${deletedDoctors.count} unverified doctor applications.`,
        );
      }
    } catch (error) {
      console.log("Failed to delete unverified doctor applications.");
    }

    console.log("Unverified Doctor Delete cron schedule (every 10 minutes)");
  });
};
