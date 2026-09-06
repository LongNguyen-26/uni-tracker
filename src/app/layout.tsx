import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import "./focus.css";

const vietnam = Be_Vietnam_Pro({
  variable: "--font-vietnam",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Uni Tracker — Hành trình đại học",
  description:
    "Bốn năm, tám học kỳ. Theo dõi mục tiêu, deadline và lưu lại những bước tiến trong hành trình đại học của bạn.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={vietnam.variable}>
      <body>{children}</body>
    </html>
  );
}
