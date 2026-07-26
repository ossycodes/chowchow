import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import type {
  ChargeInput,
  ChargeResult,
  PaymentProvider,
} from "./payment-provider";

/**
 * Local/dev payment provider. Auto-approves every charge and returns a synthetic reference.
 * Real network calls are out of scope here (and blocked in this environment); a Paystack
 * adapter implementing the same {@link PaymentProvider} port swaps in for production.
 */
@Injectable()
export class FakePaymentProvider implements PaymentProvider {
  async charge(input: ChargeInput): Promise<ChargeResult> {
    return {
      success: true,
      providerRef: `fake_${input.reference}_${randomUUID().slice(0, 8)}`,
    };
  }
}
