import { afterEach, describe, expect, it, vi } from "vitest";
import { dd, dump } from "./dd";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("dump", () => {
  it("logs each value at full depth without throwing", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const nested = { a: { b: { c: { d: 1 } } } };

    dump(nested, "second");

    expect(log).toHaveBeenCalledTimes(2);
    // full-depth: the deepest key is expanded, not collapsed to "[Object]"
    // (value is wrapped in ANSI color codes, so match the key rather than "d: 1")
    expect(log.mock.calls[0][0]).toContain("d:");
    expect(log.mock.calls[0][0]).not.toContain("[Object]");
  });
});

describe("dd", () => {
  it("dumps the values then throws to halt execution", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(() => dd({ user: "ada" })).toThrow(/dump-and-die/);
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0][0]).toContain("ada");
  });
});
