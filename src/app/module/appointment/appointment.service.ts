import {
  AppointmentStatus,
  PaymentStatus,
} from "../../../generated/prisma/enums";
import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";
import { prisma } from "../../lib/prisma";
import { RequestUser } from "../../middleware/checkAuth";

const bookAppointment = async (
  bookingData: any /*payload*/,
  user: RequestUser,
) => {
  return await prisma.$transaction(async (tx) => {
    // 1. Create appointment in DB
    const appointment = await tx.apppointment.create({
      data: {
        // we'll add other fields later on
        status: AppointmentStatus.PENDING,
      },
    });

    // 2. Obtain bKash Token
    const bkashIdToken = await getBkashIdToken();
    if (!bkashIdToken) throw new Error("No bkash access token found !");

    // 3. Prepare bKash payload (renamed variable to avoid parameter collision)
    const bkashPayload = {
      mode: "0011",
      callbackURL: `${config.bkash_callback_base_url}/appointment/book-appointment/payment/callback`,
      merchantAssociationInfo: "MI05MID54RF09123456One",
      amount: "1200",
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
        throw new Error(
          createBkashPayment.statusMessage || "bKash Payment creation failed",
        );
      }

      // 5. Create payment record in DB
      await tx.payment.create({
        data: {
          merchantInvoiceNumber: createBkashPayment.merchantInvoiceNumber,
          appointmentId: appointment.id,
          amount: 1200, // temp hardcoded
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

    if (!paymentId) throw new Error("Payment id not found");
    if (!status) throw new Error("Payment status not found");

    // execute payment
    const url = `${config.bkash_base_url}/tokenized/checkout/execute`;
    const bkashIdToken = await getBkashIdToken();

    if (!bkashIdToken) throw new Error("No bkash access token found !");

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
        await tx.apppointment.update({
          where: {
            id: executeBkashPayment.merchantInvoiceNumber,
          },
          data: {
            status: AppointmentStatus.CONFIRMED,
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

  const existingAppointment = await prisma.apppointment.findUnique({
    where: appointmentId,
  });

  if (!existingAppointment) throw new Error("Appointment does not exist");
  if (existingAppointment.status === "CONFIRMED")
    throw new Error("Appointment is already confirmed");
  if (
    existingAppointment.status === "CANCELLED" ||
    existingAppointment.status === "ONGOING" ||
    existingAppointment.status === "COMPLETED"
  )
    throw new Error(`Appointment is ${existingAppointment.status.toLowerCase}`);

  // 1. Obtain bKash Token
  const bkashIdToken = await getBkashIdToken();
  if (!bkashIdToken) throw new Error("No bkash access token found !");

  // 2. Prepare bKash payload (renamed variable to avoid parameter collision)
  const bkashPayload = {
    mode: "0011",
    callbackURL: `${config.bkash_callback_base_url}/appointment/book-appointment/payment/callback`,
    merchantAssociationInfo: "MI05MID54RF09123456One",
    amount: "1200",
    currency: "BDT",
    intent: "sale",
    merchantInvoiceNumber: existingAppointment.id,
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
      throw new Error(
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

export const AppointmentService = {
  bookAppointment,
  bookAppointmentCallback,
  payAppointment,
};
