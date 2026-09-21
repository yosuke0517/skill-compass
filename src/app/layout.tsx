import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./podcast-switches.css";

export const metadata: Metadata = {
  title: "Skill Compass",
  description: "Personal engineering growth dashboard",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Skill Compass", statusBarStyle: "default" },
  icons: { apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = { themeColor: "#176f64" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
