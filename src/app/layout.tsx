import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PantryTwin | Baltimore pantry location planner",
  description:
    "Compare two candidate Baltimore City food-pantry locations using public data, transparent operating assumptions and sourced AI explanations.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
