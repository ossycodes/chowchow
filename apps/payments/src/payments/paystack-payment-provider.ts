import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import type {
  InitInput,
  InitResult,
  PaymentProvider,
  WebhookResult,
} from "./payment-provider";

/**
 * Paystack-style provider modelling the real ASYNC flow.
 *
 * `initialize` returns `pending` + an authorization URL where the customer would pay. The
 * money is confirmed later when Paystack POSTs a signed webhook to `/payments/webhook`; we
 * verify it with HMAC-SHA512 over the raw body using the secret key (exactly how Paystack
 * signs, header `x-paystack-signature`).
 *
 * In this environment we don't call Paystack's HTTP API (no network / no live keys), so
 * `initialize` returns a synthetic reference + URL. Webhook verification is the real thing —
 * drive it by POSTing a correctly-signed body (see the smoke test).
 */
@Injectable()
export class PaystackPaymentProvider implements PaymentProvider {
  private readonly logger = new Logger(PaystackPaymentProvider.name);
  private readonly secretKey = process.env.PAYSTACK_SECRET_KEY ?? "";

  async initialize(input: InitInput): Promise<InitResult> {
    const providerRef = `ps_${randomUUID()}`;
    // Real adapter: POST https://api.paystack.co/transaction/initialize → { authorization_url }.
    return {
      providerRef,
      outcome: "pending",
      authorizationUrl: `https://checkout.paystack.com/${providerRef}?ref=${input.reference}`,
    };
  }

  verifyWebhook(
    signature: string | undefined,
    rawBody: Buffer,
  ): WebhookResult | null {
    if (!signature || !this.secretKey) return null;
    const expected = createHmac("sha512", this.secretKey)
      .update(rawBody)
      .digest("hex");
    if (!safeEqualHex(signature, expected)) {
      this.logger.warn("webhook signature mismatch — rejecting");
      return null;
    }

    let event: {
      event?: string;
      data?: { reference?: string; status?: string };
    };
    try {
      event = JSON.parse(rawBody.toString());
    } catch {
      return null;
    }

    const reference = event.data?.reference;
    if (!reference) return null;
    if (event.event === "charge.success" && event.data?.status === "success") {
      return { reference, outcome: "succeeded" };
    }
    if (event.event === "charge.failed") {
      return { reference, outcome: "failed" };
    }
    return null; // an event we don't act on
  }
}

/** Constant-time compare of two hex strings (avoids leaking timing on the signature). */
function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}
