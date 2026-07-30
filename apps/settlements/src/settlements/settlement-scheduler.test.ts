import { describe, expect, it, vi } from "vitest";
import { SettlementScheduler } from "./settlement-scheduler";

describe("SettlementScheduler.runPayouts", () => {
  it("runs both vendor and rider payouts and reports the counts", async () => {
    const runAll = vi.fn().mockResolvedValue([{ id: "s1" }, { id: "s2" }]);
    const runRiderSettlements = vi.fn().mockResolvedValue([{ id: "r1" }]);
    const scheduler = new SettlementScheduler({
      runAll,
      runRiderSettlements,
    } as never);

    const result = await scheduler.runPayouts();

    expect(runAll).toHaveBeenCalledOnce();
    expect(runRiderSettlements).toHaveBeenCalledOnce();
    expect(result).toEqual({ vendors: 2, riders: 1 });
  });
});
