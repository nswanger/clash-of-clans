import { describe, expect, it } from "vitest";
import { redirectForPath, routeForPath } from "./app-routes.js";

describe("routeForPath", () => {
  it("dispatches the three routes ADR 0002 left standing", () => {
    expect(routeForPath("#/", "leader")).toBe("cwl");
    expect(routeForPath("#/cwl", "leader")).toBe("cwl");
    expect(routeForPath("#/members", "leader")).toBe("members");
  });

  /* The phase travels as a query parameter, which the path match has always
     tolerated — it splits on `?` before comparing (ADR 0002). */
  it("ignores the phase parameter when matching the path", () => {
    expect(routeForPath("#/cwl?phase=review", "leader")).toBe("cwl");
  });

  /* A route that answered no question is not a 404 either: an unknown path lands
     on the app's default surface rather than on an error. */
  it("falls through to the default route for a path that no longer exists", () => {
    expect(routeForPath("#/season", "leader")).toBe("cwl");
    expect(routeForPath("#/dashboard", "leader")).toBe("cwl");
    expect(routeForPath("#/availability", "leader")).toBe("cwl");
  });

  it("guards direct admin access", () => {
    expect(routeForPath("#/admin", "leader")).toBe("access_denied");
    expect(routeForPath("#/admin", "admin")).toBe("admin");
  });
});

describe("redirectForPath", () => {
  it("sends the two renamed routes to their successors", () => {
    expect(redirectForPath("#/cwl-lineup")).toBe("#/cwl");
    expect(redirectForPath("#/access")).toBe("#/admin");
  });

  /* `#/overview` was deleted for duplicating the roster's own numbers, so the
     roster is where a leader who bookmarked it should land. */
  it("sends the deleted overview route to the roster it duplicated", () => {
    expect(redirectForPath("#/overview")).toBe("#/members");
  });

  it("carries the query string across a rename", () => {
    expect(redirectForPath("#/cwl-lineup?phase=review")).toBe("#/cwl?phase=review");
  });

  it("leaves a live route alone", () => {
    expect(redirectForPath("#/cwl")).toBeUndefined();
    expect(redirectForPath("#/members")).toBeUndefined();
    expect(redirectForPath("#/admin")).toBeUndefined();
  });
});
