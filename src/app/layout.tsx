import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PantryTwin — Baltimore City pantry siting",
  description:
    "Site a proposed Baltimore City food pantry against listed services using public data and labeled operating assumptions.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
