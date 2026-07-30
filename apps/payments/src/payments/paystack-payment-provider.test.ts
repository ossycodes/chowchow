import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PaystackPaymentProvider } from "./paystack-payment-provider";

const SECRET = "sk_test_secret";
const sign = (body: string) =>
  createHmac("sha512", SECRET).update(body).digest("hex");

describe("PaystackPaymentProvider", () => {
  let prev: string | undefined;
  beforeEach(() => {
    prev = process.env.PAYSTACK_SECRET_KEY;
    process.env.PAYSTACK_SECRET_KEY = SECRET;
  });
  afterEach(() => {
    process.env.PAYSTACK_SECRET_KEY = prev;
  });

  it("initialize returns pending + an authorization URL", async () => {
    const provider = new PaystackPaymentProvider();
    const res = await provider.initialize({
      amountKobo: 550000,
      reference: "order-1",
      customerId: "cust-1",
    });
    expect(res.outcome).toBe("pending");
    expect(res.authorizationUrl).toContain("order-1");
    expect(res.providerRef).toMatch(/^ps_/);
  });

  it("accepts a correctly-signed charge.success webhook", () => {
    const provider = new PaystackPaymentProvider();
    const body = JSON.stringify({
      event: "charge.success",
      data: { reference: "order-1", status: "success" },
    });
    const result = provider.verifyWebhook(sign(body), Buffer.from(body));
    expect(result).toEqual({ reference: "order-1", outcome: "succeeded" });
  });

  it("rejects a webhook with a bad signature", () => {
    const provider = new PaystackPaymentProvider();
    const body = JSON.stringify({
      event: "charge.success",
      data: { reference: "order-1", status: "success" },
    });
    expect(provider.verifyWebhook("deadbeef", Buffer.from(body))).toBeNull();
    expect(provider.verifyWebhook(undefined, Buffer.from(body))).toBeNull();
  });

  it("ignores events it doesn't act on (valid signature, other event)", () => {
    const provider = new PaystackPaymentProvider();
    const body = JSON.stringify({ event: "transfer.success", data: {} });
    expect(provider.verifyWebhook(sign(body), Buffer.from(body))).toBeNull();
  });
});
