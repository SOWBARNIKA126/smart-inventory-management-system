import { describe, expect, it } from "vitest";
import { upcomingEvents } from "../src/services/event-calendar";

const DAY = 86_400_000;
const windowDays = (start: string, end: string) => (Date.parse(end) - Date.parse(start)) / DAY + 1;

describe("verified festival comparisons", () => {
  it("aligns Diwali to each year's actual date rather than shifting the current date one year", () => {
    const diwali = upcomingEvents("2026-09-10").find(event => event.id === "diwali-2026")!;
    expect(diwali).toMatchObject({
      kind: "FESTIVAL",
      eventDate: "2026-11-08",
      previousEventDate: "2025-10-20",
      startDate: "2026-10-25",
      endDate: "2026-11-08",
      previousStartDate: "2025-10-06",
      previousEndDate: "2025-10-20",
    });
    expect(windowDays(diwali.startDate, diwali.endDate)).toBe(15);
    expect(windowDays(diwali.previousStartDate, diwali.previousEndDate)).toBe(15);
    expect(diwali.sourceUrl).toMatch(/^https:\/\//);
    expect(diwali.previousSourceUrl).toContain("2025");
  });

  it("uses 2027 actual festival days, not the court vacation dates", () => {
    // Supreme Court 2027 calendar note 2 lists actual dates separately from vacations.
    const events = upcomingEvents("2026-12-01", 365);
    expect(events.find(event => event.id === "pongal-2027")).toMatchObject({ eventDate: "2027-01-15", previousEventDate: "2026-01-15", startDate: "2027-01-01" });
    expect(events.find(event => event.id === "dussehra-2027")).toMatchObject({ eventDate: "2027-10-09", previousEventDate: "2026-10-20", startDate: "2027-09-25" });
    expect(events.find(event => event.id === "diwali-2027")).toMatchObject({ eventDate: "2027-10-29", previousEventDate: "2026-11-08", startDate: "2027-10-15" });
  });

  it("preserves the previous January festival's shopping window across the year boundary", () => {
    const pongal = upcomingEvents("2025-12-31", 1).find(event => event.id === "pongal-2026")!;
    expect(pongal).toMatchObject({ startDate: "2026-01-01", previousStartDate: "2024-12-31", previousEventDate: "2025-01-14" });
  });

  it("does not invent variable festival dates beyond verified calendars", () => {
    const events = upcomingEvents("2028-01-01", 365);
    expect(events.some(event => /^(pongal|dussehra|diwali)-/.test(event.id))).toBe(false);
    expect(events.find(event => event.id === "tamil-new-year-2028")).toMatchObject({ eventDate: "2028-04-14" });
    expect(events.find(event => event.id === "christmas-2028")).toMatchObject({ eventDate: "2028-12-25", sourceLabel: expect.stringContaining("Fixed annual date") });
  });
});

describe("planning horizon and season boundaries", () => {
  it("includes both horizon start and horizon end, and excludes starts just outside", () => {
    expect(upcomingEvents("2026-10-06", 0).map(event => event.id)).toEqual(["dussehra-2026"]);
    expect(upcomingEvents("2026-10-05", 1).map(event => event.id)).toContain("dussehra-2026");
    expect(upcomingEvents("2026-10-05", 0).map(event => event.id)).not.toContain("dussehra-2026");
    expect(upcomingEvents("2026-10-07", 30).map(event => event.id)).not.toContain("dussehra-2026");
  });

  it("excludes ongoing windows and preserves complete season end dates past the horizon", () => {
    const events = upcomingEvents("2026-09-10", 180);
    expect(events.map(event => event.id)).not.toContain("southwest-monsoon-2026");
    expect(events.find(event => event.id === "summer-2027")).toMatchObject({ startDate: "2027-03-01", endDate: "2027-05-31", previousStartDate: "2026-03-01", previousEndDate: "2026-05-31" });
    const dates = events.map(event => event.startDate);
    expect(dates).toEqual([...dates].sort());
    expect(new Set(events.map(event => event.id)).size).toBe(events.length);
  });

  it("ends winter on the last February day and keeps the correct previous-year winter", () => {
    const winter = upcomingEvents("2027-11-01", 0).find(event => event.id === "winter-2027")!;
    expect(winter).toMatchObject({
      kind: "SEASON",
      startDate: "2027-11-01",
      endDate: "2028-02-29",
      previousStartDate: "2026-11-01",
      previousEndDate: "2027-02-28",
      eventDate: null,
      previousEventDate: null,
      sourceUrl: null,
    });
    expect(windowDays(winter.startDate, winter.endDate)).toBe(121);
    expect(windowDays(winter.previousStartDate, winter.previousEndDate)).toBe(120);
    const followingWinter = upcomingEvents("2028-11-01", 0).find(event => event.id === "winter-2028")!;
    expect(followingWinter.endDate).toBe("2029-02-28");
    expect(followingWinter.previousEndDate).toBe("2028-02-29");
  });

  it("supports valid leap dates without accepting normalized invalid dates", () => {
    expect(() => upcomingEvents("2028-02-29", 1)).not.toThrow();
    expect(upcomingEvents("2028-02-29", 1).some(event => event.id === "summer-2028")).toBe(true);
  });
});

describe("calendar input validation", () => {
  it.each(["invalid", "2026-02-29", "2026-02-30", "2026-13-01", "2026-1-01", "2026-09-10T00:00:00Z", "", "0000-01-01"])("rejects invalid business date %s", date => {
    expect(() => upcomingEvents(date)).toThrow();
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])("rejects invalid or out-of-range horizon %s", horizon => {
    expect(() => upcomingEvents("2026-09-10", horizon)).toThrow();
  });
});
