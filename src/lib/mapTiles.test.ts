import { afterEach, describe, expect, it, vi } from "vitest";
import { getCartoTileUrl } from "./mapTiles";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getCartoTileUrl", () => {
  it("uses Positron tiles in light mode", () => {
    expect(getCartoTileUrl(false)).toContain("/light_all/");
  });

  it("uses Dark Matter tiles in dark mode", () => {
    expect(getCartoTileUrl(true)).toContain("/dark_all/");
  });

  it("appends the API key so raster tiles drop the watermark", () => {
    vi.stubEnv("NEXT_PUBLIC_CARTO_API_KEY", "cb1_test_key");
    expect(getCartoTileUrl(false)).toBe(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=cb1_test_key",
    );
  });

  it("falls back to the keyless URL when no key is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_CARTO_API_KEY", "");
    expect(getCartoTileUrl(false)).not.toContain("?key=");
  });
});
