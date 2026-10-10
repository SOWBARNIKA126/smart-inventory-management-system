/**
 * Retail planning windows, expressed as inclusive UTC calendar dates.
 * Festival comparisons follow the actual event in each year, including lunar
 * shifts. Variable dates are deliberately limited to verified calendars.
 * Seasons are fixed merchandising assumptions, not holiday or weather forecasts.
 */
export type PlanningEvent = {
  id: string;
  name: string;
  kind: "FESTIVAL" | "SEASON";
  startDate: string;
  endDate: string;
  previousStartDate: string;
  previousEndDate: string;
  eventDate: string | null;
  previousEventDate: string | null;
  sourceUrl: string | null;
  sourceLabel: string | null;
  previousSourceUrl?: string | null;
  previousSourceLabel?: string | null;
};

type CalendarSource = { url: string; label: string };
type FestivalDefinition = {
  slug: string;
  name: string;
  dates: Readonly<Record<number, string>>;
  sources?: Readonly<Record<number, CalendarSource>>;
  fixedMonthDay?: string;
  fixedDateLabel?: string;
};

const DAY = 86_400_000;
const SHOPPING_LEAD_DAYS = 14;

// Verified 10 September 2026. The 2027 Supreme Court calendar's note 2
// identifies actual festival dates separately from the court vacation periods.
const CALENDAR_SOURCES: Readonly<Record<number, CalendarSource>> = {
  2025: {
    url: "https://www.stationeryprinting.tn.gov.in/gazette/2025/2_VI_1_2025.pdf#page=5",
    label: "Tamil Nadu Government Gazette: 2025 holiday calendar",
  },
  2026: {
    url: "https://www.surveyofindia.gov.in/documents/circulars/document-78901-Holidays%20List%202026.pdf",
    label: "Survey of India, Chennai: 2026 holiday calendar",
  },
  2027: {
    url: "https://cdnbbsr.s3waas.gov.in/s3ec0490f1f4972d133619a60c30f3559e/uploads/2026/09/2026090138.pdf",
    label: "Supreme Court of India: 2027 calendar and festival-date notes",
  },
};

const FESTIVALS: readonly FestivalDefinition[] = [
  {
    slug: "pongal",
    name: "Pongal",
    // Use the Tamil Nadu/Chennai observance, not a combined national
    // Makar Sankranti/Magha Bihu/Pongal entry that may use a different day.
    dates: { 2025: "2025-01-14", 2026: "2026-01-15", 2027: "2027-01-15" },
  },
  {
    slug: "tamil-new-year",
    name: "Tamil New Year",
    dates: { 2025: "2025-04-14", 2026: "2026-04-14" },
    sources: {
      2026: {
        url: "https://schooledn.py.gov.in/CBSE/Pdf/Academic%20Calendar%202026-27.pdf#page=1",
        label: "Government of Puducherry: April 2026 school calendar",
      },
    },
    fixedMonthDay: "04-14",
    fixedDateLabel: "14 April",
  },
  {
    slug: "dussehra",
    name: "Dussehra / Vijayadashami",
    dates: { 2025: "2025-10-02", 2026: "2026-10-20", 2027: "2027-10-09" },
  },
  {
    slug: "diwali",
    name: "Diwali / Deepavali",
    dates: { 2025: "2025-10-20", 2026: "2026-11-08", 2027: "2027-10-29" },
  },
  {
    slug: "christmas",
    name: "Christmas",
    dates: { 2025: "2025-12-25", 2026: "2026-12-25", 2027: "2027-12-25" },
    fixedMonthDay: "12-25",
    fixedDateLabel: "25 December",
  },
];

const SEASONS = [
  { slug: "summer", name: "Summer", startMonth: 3, startDay: 1, endMonth: 5, endDay: 31 },
  { slug: "back-to-school", name: "Back-to-school", startMonth: 5, startDay: 15, endMonth: 6, endDay: 15 },
  { slug: "southwest-monsoon", name: "Southwest monsoon", startMonth: 6, startDay: 1, endMonth: 9, endDay: 30 },
  { slug: "northeast-monsoon", name: "Northeast monsoon (Tamil Nadu)", startMonth: 10, startDay: 1, endMonth: 12, endDay: 31 },
  // Day zero of March resolves to the final day of February, including leap years.
  { slug: "winter", name: "Winter", startMonth: 11, startDay: 1, endMonth: 3, endDay: 0 },
] as const;

function dateKey(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

function dateAt(year: number, month: number, day: number): string {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return dateKey(date.getTime());
}

function festivalOccurrence(festival: FestivalDefinition, year: number) {
  const verifiedDate = festival.dates[year];
  if (verifiedDate) return { date: verifiedDate, source: festival.sources?.[year] ?? CALENDAR_SOURCES[year] };
  if (!festival.fixedMonthDay) return null;
  // Fixed annual rules remain usable beyond the verified calendar years, with
  // an explicit label so a reference calendar is not mistaken for a new notice.
  const referenceYear = Math.max(...Object.keys(festival.dates).map(Number));
  const reference = festival.sources?.[referenceYear] ?? CALENDAR_SOURCES[referenceYear];
  return {
    date: `${String(year).padStart(4, "0")}-${festival.fixedMonthDay}`,
    source: {
      url: reference.url,
      label: `Fixed annual date: ${festival.fixedDateLabel}; reference: ${reference.label}`,
    },
  };
}

/**
 * Return windows whose start is within [asOf, asOf + horizonDays], in date order.
 * Ongoing windows are excluded so each forecast compares complete windows.
 * A festival window begins 14 days before its day and includes the festival day
 * (15 calendar days in total). Seasonal windows can extend beyond the horizon.
 * Variable festivals require verified dates for both the event and prior year;
 * new government calendars must be added here rather than shifting dates by 365.
 */
export function upcomingEvents(asOf: string, horizonDays = 180): PlanningEvent[] {
  const startTime = Date.parse(`${asOf}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !Number.isFinite(startTime) || dateKey(startTime) !== asOf) {
    throw new Error("asOf must be a valid ISO calendar date (YYYY-MM-DD)");
  }
  if (!Number.isSafeInteger(horizonDays) || horizonDays < 0) {
    throw new Error("horizonDays must be a nonnegative integer");
  }
  const endTime = startTime + horizonDays * DAY;
  const endYear = new Date(endTime).getUTCFullYear();
  const firstYear = new Date(startTime).getUTCFullYear();
  if (!Number.isFinite(endTime) || !Number.isFinite(endYear) || firstYear < 1 || endYear > 9998) {
    throw new Error("Planning window must stay within calendar years 0001 to 9998");
  }
  const horizonEnd = dateKey(endTime);
  const events: PlanningEvent[] = [];

  // January festival shopping can begin in December of the preceding year.
  for (let year = firstYear; year <= endYear + 1; year += 1) {
    for (const festival of FESTIVALS) {
      const current = festivalOccurrence(festival, year);
      const previous = festivalOccurrence(festival, year - 1);
      if (!current || !previous) continue;
      const startDate = dateKey(Date.parse(current.date) - SHOPPING_LEAD_DAYS * DAY);
      if (startDate < asOf || startDate > horizonEnd) continue;
      events.push({
        id: `${festival.slug}-${year}`,
        name: festival.name,
        kind: "FESTIVAL",
        startDate,
        endDate: current.date,
        previousStartDate: dateKey(Date.parse(previous.date) - SHOPPING_LEAD_DAYS * DAY),
        previousEndDate: previous.date,
        eventDate: current.date,
        previousEventDate: previous.date,
        sourceUrl: current.source.url,
        sourceLabel: current.source.label,
        previousSourceUrl: previous.source.url,
        previousSourceLabel: previous.source.label,
      });
    }

    for (const season of SEASONS) {
      const startDate = dateAt(year, season.startMonth, season.startDay);
      if (startDate < asOf || startDate > horizonEnd) continue;
      const crossesYear = season.endMonth < season.startMonth ? 1 : 0;
      const sourceLabel = season.slug === "back-to-school"
        ? "Fixed retail planning window; school reopening dates vary"
        : "Fixed retail planning window; local weather and demand vary";
      events.push({
        id: `${season.slug}-${year}`,
        name: season.name,
        kind: "SEASON",
        startDate,
        endDate: dateAt(year + crossesYear, season.endMonth, season.endDay),
        previousStartDate: dateAt(year - 1, season.startMonth, season.startDay),
        previousEndDate: dateAt(year - 1 + crossesYear, season.endMonth, season.endDay),
        eventDate: null,
        previousEventDate: null,
        sourceUrl: null,
        sourceLabel,
        previousSourceUrl: null,
        previousSourceLabel: sourceLabel,
      });
    }
  }

  return events.sort((left, right) => left.startDate.localeCompare(right.startDate) || left.id.localeCompare(right.id));
}
