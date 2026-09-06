import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";

const bookAppointment = async () => {
  const url = `${config.bkash_base_url}/tokenized/checkout/create`;
  const bkashIdToken = await getBkashIdToken();

  if (!bkashIdToken) throw new Error("No bkash access token found !");

  // hardcoded temporarily
  const payload = {
    agreementId: "randombsid67189234", // appointment id
    mode: "0011",
    payerReference: "01770618575", // account number
    callbackURL: `${config.bkash_callback_base_url}/appointment/book-appointment/payment/callback`,
    merchantAssociationInfo: "MI05MID54RF09123456One",
    amount: "1200",
    currency: "BDT",
    intent: "sale",
    merchantInvoiceNumber: "Inv0124",
  };

  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      authorization: bkashIdToken,
      "x-app-key": config.bkash_app_key,
    },
    body: JSON.stringify(payload),
  };

  try {
    const response = await fetch(url, options);
    const createBkashPayment = await response.json();

    return createBkashPayment;
  } catch (error) {
    console.error("bKash Payment Error:", error);
    throw error;
  }
};

const bookAppointmentCallback = async (query: Record<string, any>) => {
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
      paymentID: "TR0001VK1565072365492",
    }),
  };

  try {
    const response = await fetch(url, options);
    const executeBkashPayment = await response.json();

    return executeBkashPayment;
  } catch (error) {
    console.error("bKash Payment Execution Error:", error);
    throw error;
  }
};

export const AppointmentService = {
  bookAppointment,
};
