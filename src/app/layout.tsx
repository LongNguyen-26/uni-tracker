import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import "./focus.css";
import "./planning.css";
import "./schedule.css";
import "./import.css";

const vietnam = Be_Vietnam_Pro({
  variable: "--font-vietnam",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Uni Tracker — Hành trình đại học",
  description:
    "Hành trình đại học của riêng bạn: mục tiêu học kỳ, phân bổ tuần và phiên tập trung mỗi ngày.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={vietnam.variable}>
      <body>{children}</body>
    </html>
  );
}
