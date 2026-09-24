import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { ICreateSchedulePayload } from "./schedule.interface";
import httpStatus from "http-status";
import { addDays, differenceInMinutes, startOfDay } from "date-fns";
import { IQuery } from "../../interfaces";
import { ScheduleWhereInput } from "../../../generated/prisma/models";

const createSchedule = async (
  payload: ICreateSchedulePayload,
  user: RequestUser,
) => {
  // find the doctor associated with the appointment
  const doctor = await prisma.doctor.findUnique({
    where: {
      userId: user.userId,
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

const getMySchedule = async (query: IQuery, user: RequestUser) => {
  // pagination utils
  const limit = query.limit ? Number(query.limit) : 10;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder ? query.sortOrder : "desc";

  const doctor = await prisma.doctor.findUnique({
    where: {
      userId: user.userId,
    },
  });

  if (!doctor) throw new AppError(httpStatus.NOT_FOUND, "Doctor not found.");

  const andConditions: ScheduleWhereInput[] = [
    {
      doctorId: doctor?.id,
    },
    {
      isDeleted: false,
    },
  ];

  if (query.status) {
    andConditions.push({
      status: query.status,
    });
  }

  const schedule = await prisma.schedule.findMany({
    where: {
      AND: andConditions,
    },
    take: limit,
    skip,
    orderBy: {
      [sortBy]: sortOrder,
    },
    include: {
      appointments: {
        include: {
          patient: true,
        },
      },
    },
  });

  const total = await prisma.schedule.count({ where: { AND: andConditions } });

  return {
    data: schedule,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getAllSchedules = async (query: IQuery) => {
  const limit = query.limit ? Number(query.limit) : 10;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder ? query.sortOrder : "desc";

  const andConditions: ScheduleWhereInput[] = [];

  if (query.doctorId) {
    andConditions.push({ doctorId: query.doctorId });
  }
  if (query.email) {
    andConditions.push({
      doctor: {
        email: query.email,
      },
    });
  }

  if (query.status) {
    andConditions.push({ status: query.status });
  }

  if (query.searchTerm) {
    andConditions.push({
      doctor: {
        OR: [
          { name: { contains: query.searchTerm, mode: "insensitive" } },
          { email: { contains: query.searchTerm, mode: "insensitive" } },
          {
            specialization: { contains: query.searchTerm, mode: "insensitive" },
          },
        ],
      },
    });
  }

  const schedules = await prisma.schedule.findMany({
    where: {
      AND: andConditions,
    },

    take: limit,
    skip,
    orderBy: {
      // sortBy : sortOrder
      [sortBy]: sortOrder,
    },
    include: {
      appointments: {
        include: {
          patient: true,
        },
      },
    },
  });

  const total = await prisma.schedule.count({ where: { AND: andConditions } });

  return {
    data: schedules,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getScheduleById = async (scheduleId: string) => {
  const schedule = await prisma.schedule.findUnique({
    where: { id: scheduleId },
    include: {
      doctor: {
        select: {
          id: true,
          name: true,
          email: true,
          specialization: true,
          userId: true,
        },
      },
      appointments: {
        include: {
          patient: true,
        },
      },
    },
  });

  if (!schedule || schedule.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "Schedule Not Found");
  }

  return schedule;
};

export const scheduleService = {
  createSchedule,
  getMySchedule,
  getAllSchedules,
  getScheduleById,
};
