export type Profile = {
  id: string;
  display_name: string;
  start_year: number;
  start_month: number;
};
export type Goal = {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: string;
  deadline: string;
  progress: number;
  completed_on: string | null;
  created_at: string;
};
export type Activity = {
  id: string;
  user_id: string;
  goal_id: string | null;
  title: string;
  notes: string;
  occurred_on: string;
  kind: "event" | "progress" | "completion";
  created_at: string;
};
export type Semester = {
  index: number;
  year: number;
  term: number;
  start: string;
  end: string;
  days: (string | null)[];
  months: { label: string; column: number }[];
};
export const CATEGORIES = [
  "Học tập",
  "Kỹ năng",
  "Dự án",
  "Ngoại ngữ",
  "Trải nghiệm",
];
export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function parseDate(value: string): Date {
  return new Date(`${value}T12:00:00`);
}
export function todayKey() {
  return dateKey(new Date());
}
export function addDays(value: string, days: number) {
  const date = parseDate(value);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}
export function formatDate(value: string, year = false) {
  return parseDate(value).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    ...(year ? { year: "numeric" as const } : {}),
  });
}
export function daysBetween(a: string, b: string) {
  const toUTC = (v: string) => {
    const [y, m, d] = v.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUTC(b) - toUTC(a)) / 86400000);
}
export function buildSemesters(
  startYear: number,
  startMonth: number,
): Semester[] {
  return Array.from({ length: 8 }, (_, index) => {
    const startDate = new Date(startYear, startMonth - 1 + index * 6, 1, 12);
    const endDate = new Date(
      startYear,
      startMonth - 1 + (index + 1) * 6,
      0,
      12,
    );
    const offset = (startDate.getDay() + 6) % 7;
    const days: (string | null)[] = Array(offset).fill(null);
    const months: Semester["months"] = [];
    for (
      const date = new Date(startDate);
      date <= endDate;
      date.setDate(date.getDate() + 1)
    ) {
      if (date.getDate() === 1)
        months.push({
          label: `Th${date.getMonth() + 1}`,
          column: Math.floor(days.length / 7) + 1,
        });
      days.push(dateKey(date));
    }
    while (days.length % 7) days.push(null);
    return {
      index,
      year: Math.floor(index / 2) + 1,
      term: (index % 2) + 1,
      start: dateKey(startDate),
      end: dateKey(endDate),
      days,
      months,
    };
  });
}
export function streak(activities: Activity[], today: string) {
  const active = new Set(activities.map((a) => a.occurred_on));
  let cursor = active.has(today) ? today : addDays(today, -1);
  let result = 0;
  while (active.has(cursor)) {
    result++;
    cursor = addDays(cursor, -1);
  }
  return result;
}
export function demoData(today: string): {
  profile: Profile;
  goals: Goal[];
  activities: Activity[];
} {
  const y = parseDate(today).getFullYear();
  const profile: Profile = {
    id: "demo",
    display_name: "Bạn",
    start_year: y - 2,
    start_month: 9,
  };
  const goal = (
    id: string,
    title: string,
    category: string,
    progress: number,
    offset: number,
  ): Goal => ({
    id,
    user_id: "demo",
    title,
    category,
    progress,
    deadline: addDays(today, offset),
    description: "",
    completed_on: progress === 100 ? addDays(today, offset) : null,
    created_at: `${today}T00:00:00Z`,
  });
  const goals = [
    goal("g1", "Hoàn thành portfolio cá nhân", "Dự án", 75, 5),
    goal("g2", "Chinh phục IELTS 7.0", "Ngoại ngữ", 60, 24),
    goal("g3", "Học 100 bài cấu trúc dữ liệu", "Học tập", 42, 45),
    goal("g4", "Tham gia một cuộc thi hackathon", "Trải nghiệm", 100, -3),
    goal("g5", "Hoàn thành khóa Git & GitHub", "Kỹ năng", 100, -8),
  ];
  const activities: Activity[] = [];
  const first = buildSemesters(profile.start_year, 9)[0].start;
  for (let i = 0; i <= daysBetween(first, today); i++) {
    if ((i * 17 + 5) % 13 < 6) continue;
    for (let j = 0; j < 1 + (i % 4); j++)
      activities.push({
        id: `demo-${i}-${j}`,
        user_id: "demo",
        goal_id: null,
        title: [
          "Ôn tập kiến thức chuyên ngành",
          "Luyện nghe tiếng Anh",
          "Thực hành bài tập lập trình",
          "Đọc sách và ghi chú",
        ][j],
        notes: "",
        occurred_on: addDays(first, i),
        kind: "event",
        created_at: `${addDays(first, i)}T08:00:00Z`,
      });
  }
  goals
    .filter((g) => g.completed_on)
    .forEach((g) =>
      activities.push({
        id: `done-${g.id}`,
        user_id: "demo",
        goal_id: g.id,
        title: g.title,
        notes: "",
        occurred_on: g.completed_on!,
        kind: "completion",
        created_at: `${g.completed_on}T10:00:00Z`,
      }),
    );
  return { profile, goals, activities };
}
