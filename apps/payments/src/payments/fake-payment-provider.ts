import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type {
  InitInput,
  InitResult,
  PaymentProvider,
  WebhookResult,
} from "./payment-provider";

/**
 * Local/dev payment provider. Settles **instantly** — `initialize` returns `succeeded`, so no
 * webhook is involved and the order flips to PAID right away. Real network calls are out of
 * scope here; the Paystack adapter models the async webhook flow instead.
 */
@Injectable()
export class FakePaymentProvider implements PaymentProvider {
  async initialize(input: InitInput): Promise<InitResult> {
    return {
      providerRef: `fake_${input.reference}_${randomUUID().slice(0, 8)}`,
      outcome: "succeeded",
    };
  }

  verifyWebhook(): WebhookResult | null {
    return null; // fake provider settles instantly; it has no webhook
  }
}
