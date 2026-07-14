import type { Metadata } from "next";
import "./globals.css";
import "./podcast-switches.css";

export const metadata: Metadata = {
  title: "Skill Compass",
  description: "Personal engineering growth dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
