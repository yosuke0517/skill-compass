"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, Brain, Compass, Settings, Sparkles } from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dash", icon: BarChart3 },
  { href: "/today", label: "Today", icon: Sparkles },
  { href: "/skills", label: "Skills", icon: Compass },
  { href: "/concepts", label: "Concepts", icon: Brain },
  { href: "/sources", label: "Sources", icon: BookOpen },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="app-nav" aria-label="Primary">
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link key={item.href} href={item.href} title={item.label} aria-current={active ? "page" : undefined}>
            <Icon size={18} aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
