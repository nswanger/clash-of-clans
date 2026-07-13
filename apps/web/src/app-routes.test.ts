import { describe, expect, it } from "vitest";
import { routeForPath } from "./app-routes.js";

describe("routeForPath", () => {
  it("dispatches leader workflows", () => {
    expect(routeForPath("#/", "leader")).toBe("dashboard");
    expect(routeForPath("#/availability", "leader")).toBe("availability");
    expect(routeForPath("#/season", "leader")).toBe("season");
  });

  it("guards direct admin access", () => {
    expect(routeForPath("#/access", "leader")).toBe("access_denied");
    expect(routeForPath("#/access", "admin")).toBe("access");
  });
});
