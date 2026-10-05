"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Receipt,
  Scale,
  Settings,
} from "lucide-react";

const tabs = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/balances", label: "Balances", icon: Scale },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function GroupTabs({ groupSlug }: { groupSlug: string }) {
  const pathname = usePathname();

  return (
    <nav className="flex border-b border-slate-200 -mx-4 px-4">
      {tabs.map((tab) => {
        const href = `/g/${groupSlug}${tab.href}`;
        const isActive = pathname.startsWith(href);
        const Icon = tab.icon;

        return (
          <Link
            key={tab.href}
            href={href}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              isActive
                ? "border-emerald-700 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <Icon size={16} />
            <span className="hidden sm:inline">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
