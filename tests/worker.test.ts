import { describe, expect, it } from "vitest";
import { normalizeTimeWindows, validateTimeWindows } from "../src/worker";

describe("normalizeTimeWindows", () => {
  it("defaults to full-day window when empty", () => {
    const result = normalizeTimeWindows([]);
    expect(result).toEqual([{ startTime: "00:00", endTime: "23:59" }]);
  });

  it("trims and filters invalid windows", () => {
    const result = normalizeTimeWindows([
      { startTime: " 09:00 ", endTime: " 17:00 " },
      { startTime: " ", endTime: "" },
    ]);
    expect(result).toEqual([{ startTime: "09:00", endTime: "17:00" }]);
  });

  it("defaults missing window values to full day", () => {
    const result = normalizeTimeWindows([{} as { startTime: string; endTime: string }]);
    expect(result).toEqual([{ startTime: "00:00", endTime: "23:59" }]);
  });
});

describe("validateTimeWindows", () => {
  it("rejects non-array inputs and empty arrays", () => {
    expect(validateTimeWindows([])).toBe(false);
    expect(validateTimeWindows({} as unknown as { startTime: string; endTime: string }[])).toBe(false);
  });

  it("accepts valid ordered windows and rejects invalid times", () => {
    expect(validateTimeWindows([{ startTime: "09:00", endTime: "17:00" }])).toBe(true);
    expect(validateTimeWindows([{ startTime: "25:00", endTime: "26:00" }])).toBe(false);
    expect(validateTimeWindows([{ startTime: "09:00", endTime: "08:00" }])).toBe(false);
    expect(validateTimeWindows([{ startTime: "9:00", endTime: "10:00" }])).toBe(false);
  });
});
