import { Controller, Get, Query } from "@nestjs/common";
import { LedgerService } from "./ledger.service";

/**
 * Read-only reporting surface (ops/finance). Recording is event-driven (payment.succeeded
 * consumer), never a route. Routed under `/ledger` and authed at the gateway.
 */
@Controller("ledger")
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get("accounts")
  async accounts() {
    return { accounts: await this.ledger.getBalances() };
  }

  @Get("journals")
  async journals(@Query("limit") limit?: string) {
    const n = limit ? Math.min(Number(limit) || 50, 200) : 50;
    return { journals: await this.ledger.getJournals(n) };
  }
}
