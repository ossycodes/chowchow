/** DI token for the payment provider port. */
export const PAYMENT_PROVIDER = Symbol("PAYMENT_PROVIDER");

export interface ChargeInput {
  amountKobo: number;
  /** Idempotency reference we pass to the provider (we use the orderId). */
  reference: string;
  customerId: string;
}

export interface ChargeResult {
  success: boolean;
  /** Provider's transaction reference (present on success). */
  providerRef: string;
  /** Why it failed (present on failure). */
  reason?: string;
}

/**
 * Port for charging a customer. The order/payments domain depends on THIS, not on any
 * specific provider — so a real Paystack/Flutterwave adapter can drop in later without
 * touching payment logic. (Ports & adapters, same pattern as the catalog gRPC client.)
 */
export interface PaymentProvider {
  charge(input: ChargeInput): Promise<ChargeResult>;
}
