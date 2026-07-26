/** DI tokens for the messaging ports (kept separate to avoid circular imports). */
export const MESSAGE_PRODUCER = Symbol("MESSAGE_PRODUCER");
export const OUTBOX_STORE = Symbol("OUTBOX_STORE");
export const MESSAGE_CONSUMER = Symbol("MESSAGE_CONSUMER");
export const PROCESSED_STORE = Symbol("PROCESSED_STORE");
