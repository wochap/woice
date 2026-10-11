import { describe, expect, it } from "vitest";

const sources = import.meta.glob(
  ["/src/**/*.{ts,tsx}", "!/src/**/*.test.{ts,tsx}"],
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
) as Record<string, string>;

describe("colour roles", () => {
  it("has no hard-coded colours outside the theme stylesheet", () => {
    const offenders = Object.entries(sources).filter(([, text]) =>
      /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(text),
    );
    expect(offenders.map(([f]) => f)).toEqual([]);
    expect(Object.keys(sources).length).toBeGreaterThan(20);
  });
});
