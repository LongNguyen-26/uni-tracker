import {
  addDays,
  daysBetween,
  parseDate,
  type Profile,
  type SemesterSettings,
} from "./timeline";
import { academicSettings, journeySettings } from "./schedule";
import { monday, validateSemesterSettings } from "./planning";

export const PROGRAM_YEARS = [3, 4, 5, 6] as const;
export type SetupPart = "timetable" | "goals" | "activities";
export function setupTerm(profile: Profile, day: string) {
  const terms = journeySettings(profile);
  return (
    terms.find((t) => t.index === profile.onboarding_term) ||
    terms.find((t) => t.start <= day && t.end >= day) ||
    terms.find((t) => t.end >= day) ||
    terms[terms.length - 1]
  );
}
// Anchor estimates to the semester the student knows. Only it is confirmed.
export function setupJourney(
  profile: Profile,
  years: number,
  index: number,
  start: string,
  end: string,
): Profile {
  if (!Number.isInteger(index) || index < 0 || index >= years * 2)
    throw new Error("Chọn học kỳ nằm trong chương trình của bạn.");
  const date = parseDate(start);
  const startYear =
    date.getFullYear() -
    Math.floor(index / 2) -
    (index % 2 === 1 || date.getMonth() < 6 ? 1 : 0);
  const terms = academicSettings(startYear, years);
  terms[index] = { ...terms[index], start: monday(start), end };
  for (let i = index - 1; i >= 0; i--) {
    if (terms[i].end >= terms[i + 1].start) {
      const duration = daysBetween(terms[i].start, terms[i].end);
      const newEnd = addDays(terms[i + 1].start, -1);
      terms[i] = {
        ...terms[i],
        start: monday(addDays(newEnd, -duration)),
        end: newEnd,
      };
    }
  }
  for (let i = index + 1; i < terms.length; i++) {
    if (terms[i].start <= terms[i - 1].end) {
      const duration = daysBetween(terms[i].start, terms[i].end);
      const nextMonday = addDays(monday(terms[i - 1].end), 7);
      terms[i] = {
        ...terms[i],
        start: nextMonday,
        end: addDays(nextMonday, duration),
      };
    }
  }
  const result = {
    ...profile,
    start_year: startYear,
    start_month: 8,
    study_years: years,
    semester_settings: terms,
    confirmed_semesters: [index],
    onboarding_term: index,
  };
  validateSemesterSettings(result);
  return result;
}
export function setupWeek(term: SemesterSettings, day: string) {
  return monday(
    day < term.start ? term.start : day > term.end ? term.start : day,
  );
}
