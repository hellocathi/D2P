import { it, expect } from "vitest";
import { dimensions } from "../src";
it("guards final canvas budget including high resolution exports", () => {
  expect(dimensions(750, 2000, 2)).toEqual({ w: 1500, h: 4000 });
  expect(() => dimensions(750, 20000, 2)).toThrow();
  expect(() => dimensions(1200, 16000, 3)).toThrow();
  expect(() => dimensions(750, 1000, NaN)).toThrow();
});
