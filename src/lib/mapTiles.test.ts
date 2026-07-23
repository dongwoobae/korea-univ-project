import { describe, expect, it } from "vitest";
import { getCartoTileUrl } from "./mapTiles";

describe("getCartoTileUrl", () => {
  it("uses Positron tiles in light mode", () => {
    expect(getCartoTileUrl(false)).toContain("/light_all/");
  });

  it("uses Dark Matter tiles in dark mode", () => {
    expect(getCartoTileUrl(true)).toContain("/dark_all/");
  });
});
