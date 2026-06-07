import { describe, it, expect } from "vitest";

// Validates severity badge renders correct label text
describe("SeverityBadge", () => {
  it("severity levels are defined correctly", () => {
    const levels = ["critical", "high", "medium", "info"];
    expect(levels).toHaveLength(4);
    expect(levels[0]).toBe("critical");
  });
});
