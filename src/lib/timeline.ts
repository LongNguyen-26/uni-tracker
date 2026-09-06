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
  color: string;
  tracking_mode: "progress" | "milestone";
  milestone_kind: MilestoneKind;
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
  duration_minutes: number;
  color: string;
  is_milestone: boolean;
  milestone_kind: MilestoneKind;
  goal_title: string;
  created_at: string;
};
export type MilestoneKind = "general" | "midterm" | "final" | "achievement";
export type GoalInput = Pick<
  Goal,
  | "title"
  | "description"
  | "category"
  | "deadline"
  | "progress"
  | "completed_on"
  | "color"
  | "tracking_mode"
  | "milestone_kind"
>;
export type ActivityInput = Pick<
  Activity,
  | "title"
  | "notes"
  | "occurred_on"
  | "goal_id"
  | "duration_minutes"
  | "color"
  | "is_milestone"
  | "milestone_kind"
>;
export const GOAL_COLORS = [
  "#2563eb",
  "#7c3aed",
  "#0d9488",
  "#ea580c",
  "#db2777",
  "#dc2626",
  "#ca8a04",
  "#237a4b",
];
export const MILESTONE_LABELS: Record<MilestoneKind, string> = {
  general: "Cột mốc",
  midterm: "Thi giữa kỳ",
  final: "Thi cuối kỳ",
  achievement: "Thành tựu",
};
export const MILESTONE_COLORS: Record<MilestoneKind, string> = {
  general: "#7c3aed",
  midterm: "#ea580c",
  final: "#dc2626",
  achievement: "#ca8a04",
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
    color: GOAL_COLORS[Number(id.slice(1)) % GOAL_COLORS.length],
    tracking_mode: "progress",
    milestone_kind: "general",
    progress,
    deadline: addDays(today, offset),
    description: "",
    completed_on: progress === 100 ? addDays(today, offset) : null,
    created_at: `${today}T00:00:00Z`,
  });
  const goals = [
    goal("g1", "Hoàn thành portfolio cá nhân", "Dự án", 75, 5),
    goal("g2", "Chinh phục IELTS 7.0", "Ngoại ngữ", 60, 24),
    goal("g3", "Viết paper nghiên cứu đầu tiên", "Học tập", 42, 45),
    {
      ...goal("g4", "Có giải tại Hackathon", "Trải nghiệm", 100, -3),
      tracking_mode: "milestone" as const,
      milestone_kind: "achievement" as const,
      color: "#ca8a04",
    },
    goal("g5", "Hoàn thành khóa Git & GitHub", "Kỹ năng", 100, -8),
    {
      ...goal("g6", "Thi giữa kỳ · Xác suất thống kê", "Học tập", 0, 5),
      tracking_mode: "milestone" as const,
      milestone_kind: "midterm" as const,
      color: "#ea580c",
    },
    {
      ...goal("g7", "Thi cuối kỳ · Cấu trúc dữ liệu", "Học tập", 0, 24),
      tracking_mode: "milestone" as const,
      milestone_kind: "final" as const,
      color: "#dc2626",
    },
    {
      ...goal("g8", "GPA học kỳ đạt 3.5+", "Học tập", 0, 60),
      tracking_mode: "milestone" as const,
      milestone_kind: "general" as const,
      color: "#db2777",
    },
  ];
  const activities: Activity[] = [];
  const first = buildSemesters(profile.start_year, 9)[0].start;
  for (let i = 0; i <= daysBetween(first, today); i++) {
    if ((i * 17 + 5) % 13 < 6) continue;
    for (let j = 0; j < 1 + (i % 4); j++)
      activities.push({
        id: `demo-${i}-${j}`,
        user_id: "demo",
        goal_id: ["g2", "g3", "g1", null][j],
        title: [
          "Luyện IELTS Listening & Reading",
          "Đọc tài liệu và viết bản nháp paper",
          "Xây dựng dự án portfolio",
          "Đọc sách và ghi chú",
        ][j],
        notes: "",
        occurred_on: addDays(first, i),
        kind: "event",
        duration_minutes: [45, 90, 60, 20][j],
        color:
          goals.find((g) => g.id === ["g2", "g3", "g1", null][j])?.color ||
          "#237a4b",
        goal_title:
          goals.find((g) => g.id === ["g2", "g3", "g1", null][j])?.title || "",
        is_milestone: false,
        milestone_kind: "general",
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
        duration_minutes: 0,
        color: g.color,
        goal_title: g.title,
        is_milestone: true,
        milestone_kind: g.milestone_kind,
        created_at: `${g.completed_on}T10:00:00Z`,
      }),
    );
  return { profile, goals, activities };
}
