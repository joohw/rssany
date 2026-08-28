import { describe, expect, it } from "vitest";
import {
  normalizeSourceProxyMode,
  resolveSourceProxyPolicy,
} from "../app/scraper/subscription/index.ts";

describe("source proxy policy", () => {
  it("defaults configured sources to direct access", () => {
    expect(normalizeSourceProxyMode(undefined, undefined)).toBe("none");
    expect(resolveSourceProxyPolicy({}, "http://collector:7890", "http://default:7890")).toBe("");
    expect(resolveSourceProxyPolicy({ proxyMode: "none" }, undefined, "http://default:7890")).toBe("");
  });

  it("uses the default proxy only when explicitly selected", () => {
    expect(resolveSourceProxyPolicy({ proxyMode: "default" }, undefined, "http://default:7890"))
      .toBe("http://default:7890");
    expect(resolveSourceProxyPolicy({ proxyMode: "default" }, undefined, undefined)).toBe("");
  });

  it("supports custom proxies and legacy proxy-only sources", () => {
    expect(normalizeSourceProxyMode(undefined, "http://custom:7890")).toBe("custom");
    expect(normalizeSourceProxyMode("custom", "")).toBe("none");
    expect(resolveSourceProxyPolicy({ proxyMode: "custom", proxy: " http://custom:7890 " }, undefined, undefined))
      .toBe("http://custom:7890");
  });

  it("keeps collector proxies only for URLs outside the configured source list", () => {
    expect(resolveSourceProxyPolicy(undefined, " http://collector:7890 ", "http://default:7890"))
      .toBe("http://collector:7890");
    expect(resolveSourceProxyPolicy(undefined, undefined, "http://default:7890")).toBe("");
  });
});
