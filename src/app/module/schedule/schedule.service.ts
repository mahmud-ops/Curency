import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { ICreateSchedulePayload } from "./schedule.interface";
import httpStatus from "http-status";
import { addDays, differenceInMinutes, startOfDay } from "date-fns";

const createSchedule = async (
  payload: ICreateSchedulePayload,
  user: RequestUser,
) => {
  // find the doctor associated with the appointment
  const doctor = await prisma.doctor.findUnique({
    where: {
      id: user.userId,
    },
  });

  if (!doctor)
    throw new AppError(httpStatus.NOT_FOUND, "Doctor profile not found");

  //   --- we'll need the date-fns package here ---
  // doc: https://date-fns.org/

  // let's assume: startDateTime = 2026-08-25T13:30:00.436Z => 25 aug, 1:30 PM
  // it'll be converted into: 25 August => 12:00 AM => 2026-08-25T00:00:00.436Z ( start of the day)
  const startOfTheDay = startOfDay(payload.startDataTime);
  const startOfNextDay = addDays(payload.startDataTime, 1);
  // add 1 day | 26 August => 12:00 AM => 2026-08-26T00:00:00.436Z

  const existingScheduleOnThisDay = await prisma.schedule.findFirst({
    where: {
      doctorId: doctor.id,
      isDeleted: false,
      startDateTime: {
        // startOfTheDay <= startdate < startOfNextData
        gte: startOfTheDay,
        lt: startOfNextDay,
      },
    },
  });

  if (existingScheduleOnThisDay)
    throw new AppError(
      httpStatus.CONFLICT,
      "You already have a schedule on this date.",
    );

  // calculate how many minutes the session will be
  const durationInMinutes = differenceInMinutes(
    payload.endDateTime,
    payload.startDataTime,
  );

  // Each session should be 20 minutes, 40 minutes, 60 minutes, 80 minutes, and so on.
  const MINUTES_ALLOCATED_PER_SLOT = 20;

  const totalSlot = Math.floor(durationInMinutes / MINUTES_ALLOCATED_PER_SLOT);

  if (totalSlot < 1) {
    throw new AppError(
      httpStatus.CONFLICT,
      `Schedule Must Be At Least ${MINUTES_ALLOCATED_PER_SLOT} Minutes Long To Fit One Slot`,
    );
  }

  //    --- Finally , create the schedule ---
  // kept the total and available schedule the same for now ( temp )
  const schedule = await prisma.schedule.create({
    data: {
      startDateTime: payload.startDataTime,
      endDateTime: payload.endDateTime,
      meetingLink: payload.meetingLink,
      totalSlots: totalSlot,
      availableSlots: totalSlot,
      doctorId: doctor.id,
    },
    include: {
      doctor: {
        select: {
          name: true,
          email: true,
          contactNumber: true,
        },
      },
    },
  });

  return schedule;
};

export const scheduleService = {
  createSchedule,
};
