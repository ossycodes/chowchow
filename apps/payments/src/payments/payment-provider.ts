/** DI token for the payment provider port. */
export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");

export interface InitInput {
  amountKobo: number;
  /** Our reference (the orderId) — the provider echoes it back on its webhook. */
  reference: string;
  customerId: string;
}

/** Where a charge stands right after we start it. */
export type PaymentOutcome = "pending" | "succeeded" | "failed";

export interface InitResult {
  /** The provider's transaction reference. */
  providerRef: string;
  /** `succeeded` = settled instantly (test); `pending` = awaits the provider's webhook. */
  outcome: PaymentOutcome;
  /** Where the customer completes payment (async providers). */
  authorizationUrl?: string;
  /** Why it failed (present on `failed`). */
  reason?: string;
}

export interface WebhookResult {
  /** Our reference (= orderId) the webhook is about. */
  reference: string;
  outcome: "succeeded" | "failed";
}

/**
 * Port for charging a customer. Real providers are ASYNC: `initialize` starts the charge and
 * the money is confirmed later by a signed `webhook`. The fake provider settles instantly
 * (returns `succeeded` from initialize) so local dev needs no webhook. The payments domain
 * depends on THIS, not on any specific provider.
 */
export interface PaymentProvider {
  /** Start a charge. */
  initialize(input: InitInput): Promise<InitResult>;
  /**
   * Verify a provider webhook by its signature and extract the result, or null if the
   * signature is invalid / the event isn't one we act on. `rawBody` is the exact bytes the
   * provider signed.
   */
  verifyWebhook(
    signature: string | undefined,
    rawBody: Buffer,
  ): WebhookResult | null;
}
