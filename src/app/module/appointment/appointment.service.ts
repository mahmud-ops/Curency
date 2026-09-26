import { addMinutes } from "date-fns";
import {
  AppointmentStatus,
  PaymentStatus,
} from "../../../generated/prisma/enums";
import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";
import { AppError } from "../../utils/AppError";
import { IBookAppointmentPayload } from "./appointment.interface";
import httpStatus from "http-status";
import { transporter } from "../../lib/nodemailer";

const bookAppointment = async (
  bookingData: IBookAppointmentPayload,
  user: RequestUser,
) => {
  return await prisma.$transaction(async (tx) => {
    // 1. create appointment
    const schedule = await prisma.schedule.findUnique({
      where: {
        id: bookingData.scheduleId,
      },
      include: {
        doctor: true,
      },
    });

    if (!schedule)
      throw new AppError(
        httpStatus.NOT_FOUND,
        `Schedule with id: ${bookingData.scheduleId} is not found.`,
      );

    const patient = await prisma.patient.findUnique({
      where: {
        userId: user.userId,
      },
    });

    if (!patient)
      throw new AppError(httpStatus.NOT_FOUND, "Patiend is not found.");

    const existingAppointment = await prisma.appointment.findFirst({
      where: {
        patientId: patient.id,
        scheduleId: schedule.id,
      },
    });

    if (existingAppointment?.status == "PENDING")
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "You already have a pending appointment, please pay for that first.",
      );

    if (existingAppointment?.status == "ONGOING")
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "You already have an ongoing appointment.",
      );

    if (existingAppointment?.status === AppointmentStatus.COMPLETED) {
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "You Already Have Completed An Appointment On This Schedule. Please Try Again Another Day",
      );
    }

    if (schedule.availableSlots == 0)
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "This schedule is fully booked",
      );

    if (!schedule.doctor.consultationFee)
      throw new AppError(
        httpStatus.BAD_REQUEST,
        "The doctor didn't set a consultation fee.",
      );

    const amount = schedule.doctor.consultationFee.toString();

    const appointment = await tx.appointment.create({
      data: {
        status: AppointmentStatus.PENDING,
        patientId: patient.id,
        doctorId: schedule.doctor.id,
        scheduleId: schedule.id,
      },
    });

    // 2. Obtain bKash Token
    const bkashIdToken = await getBkashIdToken();
    if (!bkashIdToken) throw new AppError(400, "No bkash access token found !");

    // 3. Prepare bKash payload (renamed variable to avoid parameter collision)
    const bkashPayload = {
      mode: "0011",
      callbackURL: `${config.bkash_callback_base_url}/appointment/book-appointment/payment/callback`,
      merchantAssociationInfo: "MI05MID54RF09123456One",
      amount: amount,
      currency: "BDT",
      intent: "sale",
      merchantInvoiceNumber: appointment.id,
    };

    const url = `${config.bkash_base_url}/tokenized/checkout/create`;
    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        authorization: bkashIdToken,
        "x-app-key": config.bkash_app_key,
      },
      body: JSON.stringify(bkashPayload),
    };

    try {
      // 4. Call bKash API
      const response = await fetch(url, options);
      const createBkashPayment = await response.json();

      // Check if bKash returned an error status code or missing paymentID
      if (
        createBkashPayment.statusCode &&
        createBkashPayment.statusCode !== "0000"
      ) {
        throw new AppError(
          502,
          createBkashPayment.statusMessage || "bKash Payment creation failed",
        );
      }

      // 5. Create payment record in DB
      await tx.payment.create({
        data: {
          merchantInvoiceNumber: createBkashPayment.merchantInvoiceNumber,
          appointmentId: appointment.id,
          amount: amount,
          gatewayResponse: createBkashPayment,
          bkashPaymentId: createBkashPayment.paymentID,
        },
      });

      return createBkashPayment.bkashURL;
    } catch (error) {
      console.error("bKash Payment Error:", error);
      throw error; // Throwing inside $transaction triggers ROLLBACK for the appointment creation
    }
  });
};

const bookAppointmentCallback = async (query: Record<string, any>) => {
  return await prisma.$transaction(async (tx) => {
    const paymentId = query.paymentID;
    const status = query.status;

    if (!paymentId) throw new AppError(400, "Payment id not found");
    if (!status) throw new AppError(400, "Payment status not found");

    // execute payment
    const url = `${config.bkash_base_url}/tokenized/checkout/execute`;
    const bkashIdToken = await getBkashIdToken();

    if (!bkashIdToken) throw new AppError(400, "No bkash access token found !");

    const options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        authorization: bkashIdToken,
        "x-app-key": config.bkash_app_key,
      },
      body: JSON.stringify({
        paymentID: paymentId, // from the query
      }),
    };

    try {
      const response = await fetch(url, options);
      const executeBkashPayment = await response.json();

      if (status === "success") {
        const appointment = await prisma.appointment.findUnique({
          where: {
            id: executeBkashPayment.merchantInvoiceNumber,
          },
          include: {
            schedule: true,
            patient: true,
            doctor: true,
          },
        });

        if (!appointment)
          throw new AppError(httpStatus.NOT_FOUND, "Appointment not found.");

        // slot booking flow

        const alreadyBookedSlots =
          appointment.schedule.totalSlots - appointment.schedule.availableSlots;

        const serialNumber = alreadyBookedSlots + 1;

        // 25 August => 3:00 PM - 4:00 PM
        // 1st person joining time => startDateTime = 2026-08-25T15:00:00.436Z => 3:00 PM
        // serial number (1) - 1 * 20 => 0 minues

        // 2nd person joining time => startDateTime = 2026-08-25T15:20:00.436Z => 3:20 PM
        // serial number (2) - 1 * 20 => 20 minutes

        // 3nd person joining time => startDateTime = 2026-08-25T15:40:00.436Z => 3:40 PM
        // serial number (3) - 1 * 20 => 40 mintes

        const joiningTime = addMinutes(
          appointment.schedule.startDateTime,
          (serialNumber - 1) * 20,
        );

        await tx.appointment.update({
          where: {
            id: executeBkashPayment.merchantInvoiceNumber,
          },
          data: {
            status: AppointmentStatus.CONFIRMED,
            joiningTime,
            serialNumber,
          },
        });

        // one slot allocayed , hence, decrease slot.
        const newAvailableSlots = appointment.schedule.availableSlots - 1;
        await prisma.schedule.update({
          where: {
            id: appointment.schedule.id,
          },
          data: {
            availableSlots: newAvailableSlots,
          },
        });

        await tx.payment.update({
          where: {
            appointmentId: executeBkashPayment.merchantInvoiceNumber,
          },

          data: {
            status: PaymentStatus.PAID,
            bkashTrxId: executeBkashPayment.trxID,
            paidAt: executeBkashPayment.paymentExecuteTime,
            gatewayResponse: executeBkashPayment,
          },
        });


        // send email if payment is successfull. We'll handle PDF invoice next
        await transporter.sendMail({
          from: config.email_sender,
          to: appointment.patient.email,
          subject: "Your Appointment Invoice - PH Healthcare System",
          text: "Thank you for booking an appointment. Please find your invoice attached.",
        });

        return {
          redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=success`,
        };
      } else if (status === "failure") {
        await tx.payment.update({
          where: {
            bkashPaymentId: paymentId,
          },

          data: {
            status: PaymentStatus.FAILED,
            gatewayResponse: executeBkashPayment,
          },
        });

        return {
          redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=failure`,
        };
      } else if (status === "cancel") {
        await tx.payment.update({
          where: {
            bkashPaymentId: paymentId,
          },

          data: {
            status: PaymentStatus.CANCELLED,
            gatewayResponse: executeBkashPayment,
          },
        });

        return {
          redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=cancel`,
        };
      } else {
        return {
          redirectUrl: `${config.frontend_url}/dashboard/my-appointments?error=payment-failed`,
        };
      }
    } catch (error) {
      console.error("bKash Payment Execution Error:", error);
      throw error;
    }
  });
};

const payAppointment = async (payload: any, user: RequestUser) => {
  const appointmentId = payload.appointmentId;

  const existingAppointment = await prisma.appointment.findUnique({
    where: {
      id: appointmentId,
    },
    include: {
      schedule: {
        include: {
          doctor: true,
        },
      },
    },
  });

  if (!existingAppointment)
    throw new AppError(404, "Appointment does not exist");
  if (existingAppointment.status === "CONFIRMED")
    throw new AppError(409, "Appointment is already confirmed");
  if (existingAppointment.status !== "PENDING")
    throw new AppError(httpStatus.BAD_REQUEST, "Appointment is not pending.");

  if (!existingAppointment.schedule.doctor.consultationFee) {
    throw new AppError(
      httpStatus.BAD_REQUEST,
      "Doctor Has Not Set A Consultation Fee Yet",
    );
  }

  const amount = existingAppointment.schedule.doctor.consultationFee.toString();

  // 1. Obtain bKash Token
  const bkashIdToken = await getBkashIdToken();
  if (!bkashIdToken) throw new AppError(400, "No bkash access token found !");

  // 2. Prepare bKash payload
  const bkashPayload = {
    mode: "0011",
    callbackURL: `${config.bkash_callback_base_url}/appointment/book-appointment/payment/callback`,
    merchantAssociationInfo: "MI05MID54RF09123456One",
    amount: amount,
    currency: "BDT",
    intent: "sale",
    merchantInvoiceNumber: existingAppointment.id,
    payerReference: user.email,
  };

  const url = `${config.bkash_base_url}/tokenized/checkout/create`;
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      authorization: bkashIdToken,
      "x-app-key": config.bkash_app_key,
    },
    body: JSON.stringify(bkashPayload),
  };

  try {
    // 3. Call bKash API
    const response = await fetch(url, options);
    const createBkashPayment = await response.json();

    // Check if bKash returned an error status code or missing paymentID
    if (
      createBkashPayment.statusCode &&
      createBkashPayment.statusCode !== "0000"
    ) {
      throw new AppError(
        502,
        createBkashPayment.statusMessage || "bKash Payment creation failed",
      );
    }

    // 4. Update payment record in DB
    await prisma.payment.update({
      where: {
        appointmentId: existingAppointment.id,
      },
      data: {
        merchantInvoiceNumber: createBkashPayment.merchantInvoiceNumber,
        gatewayResponse: createBkashPayment,
        bkashPaymentId: createBkashPayment.paymentID,
      },
    });

    return createBkashPayment.bkashURL;
  } catch (error) {
    console.error("bKash Payment Error:", error);
    throw error; // Throwing inside $transaction triggers ROLLBACK for the appointment creation
  }
};

const cancelAppointment = async (payload: any, user: RequestUser) => {
  const appointmentId = payload.appointmentId;

  const existingAppointment = await prisma.appointment.findUnique({
    where: {
      id: appointmentId,
    },
    include: {
      payment: true,
    },
  });

  if (!existingAppointment) {
    throw new AppError(404, "Appointment does not exist");
  }

  if (
    existingAppointment.status === "COMPLETED" ||
    existingAppointment.status === "ONGOING"
  ) {
    throw new AppError(
      409,
      `Appointment is ${existingAppointment.status.toLowerCase()}`,
    );
  }

  if (existingAppointment.status === "CANCELLED") {
    throw new AppError(409, "Appointment is already cancelled");
  }

  // Ensure payment details exist
  const payment = existingAppointment.payment;
  if (!payment || !payment.bkashPaymentId || !payment.bkashTrxId) {
    throw new AppError(
      400,
      "No completed transaction found for this appointment to refund.",
    );
  }

  // 1. Obtain bKash Token
  const bkashIdToken = await getBkashIdToken();

  if (!bkashIdToken) {
    throw new AppError(400, "No bkash access token found!");
  }

  // 2. Prepare bKash refund payload
  const bkashRefundPayload = {
    paymentID: payment.bkashPaymentId,
    trxID: payment.bkashTrxId,
    amount: payment.amount?.toString(),
    sku: "appointment",
    reason: "Appointment cancelled",
  };

  // 3. Prepare bKash refund API URL
  const url = `${config.bkash_base_url}/tokenized/checkout/payment/refund`;

  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      authorization: bkashIdToken,
      "x-app-key": config.bkash_app_key,
    },
    body: JSON.stringify(bkashRefundPayload),
  };

  try {
    // 4. Call bKash Refund API
    const response = await fetch(url, options);
    const refundResponse = await response.json();

    console.log("bKash Refund Response Payload:", refundResponse);

    // 5. Check if bKash returned an error
    if (refundResponse.statusCode && refundResponse.statusCode !== "0000") {
      const errorMsg =
        refundResponse.statusMessage ||
        refundResponse.errorMessage ||
        refundResponse.errorMessageEn ||
        `bKash refund failed with code ${refundResponse.statusCode}`;

      throw new AppError(502, errorMsg);
    }

    // 6. Check refund transaction status (handles both transactionStatus and refundTransactionStatus)
    const status =
      refundResponse.transactionStatus ||
      refundResponse.refundTransactionStatus;
    if (status !== "Completed") {
      throw new AppError(
        502,
        `bKash refund pending/failed with status: ${status || "Unknown"}`,
      );
    }

    // 7. Update appointment and payment atomically
    const result = await prisma.$transaction(async (tx) => {
      const updatedAppointment = await tx.appointment.update({
        where: {
          id: appointmentId,
        },
        data: {
          status: "CANCELLED",
        },
      });

      const updatedPayment = await tx.payment.update({
        where: {
          appointmentId: appointmentId,
        },
        data: {
          gatewayResponse: refundResponse,
          refundTrxId: refundResponse.refundTrxID,
          refundedAt: refundResponse.completedTime,
          refundAmount: refundResponse.amount,
          refundReason: bkashRefundPayload.reason,
          status: PaymentStatus.REFUNDED,
        },
      });

      return {
        appointment: updatedAppointment,
        payment: updatedPayment,
      };
    });

    // 8. Return updated appointment and refund response
    return {
      appointment: result,
      refund: refundResponse,
    };
  } catch (error) {
    console.error("bKash Refund Error:", error);
    throw error;
  }
};

export const AppointmentService = {
  bookAppointment,
  bookAppointmentCallback,
  payAppointment,
  cancelAppointment,
};
