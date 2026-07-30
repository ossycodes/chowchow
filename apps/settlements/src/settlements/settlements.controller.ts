import { Controller, Get, Post } from "@nestjs/common";
import { SettlementsService } from "./settlements.service";

/**
 * Ops/finance surface. Earnings accrue automatically (payment.succeeded consumer). A run pays
 * out every vendor with a positive balance. Routed under `/settlements`, authed at the gateway.
 */
@Controller("settlements")
export class SettlementsController {
  constructor(private readonly settlements: SettlementsService) {}

  /** Pay out all vendors with unsettled earnings. Returns the settlements created. */
  @Post("run")
  async run() {
    return { settlements: await this.settlements.runAll() };
  }

  @Get()
  async list() {
    return { settlements: await this.settlements.listSettlements() };
  }

  @Get("balances")
  async balances() {
    return { balances: await this.settlements.getBalances() };
  }

  // --- rider payouts (delivery-fee earnings) ---

  @Post("riders/run")
  async runRiders() {
    return { settlements: await this.settlements.runRiderSettlements() };
  }

  @Get("riders")
  async listRiders() {
    return { settlements: await this.settlements.listRiderSettlements() };
  }

  @Get("riders/balances")
  async riderBalances() {
    return { balances: await this.settlements.getRiderBalances() };
  }
}
