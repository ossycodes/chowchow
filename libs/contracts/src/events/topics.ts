/**
 * Central registry of Kafka topics. One topic per aggregate; event `type` inside the
 * envelope distinguishes the specific event (e.g. topic "order" carries order.created,
 * order.paid, ...). Keeping this in one place prevents topic-name drift between services.
 */
export const Topics = {
  Identity: "identity",
  Catalog: "catalog",
  Order: "order",
  Dispatch: "dispatch",
  Payment: "payment",
  Ledger: "ledger",
  Rider: "rider",
  Notification: "notification",
} as const;

export type Topic = (typeof Topics)[keyof typeof Topics];
