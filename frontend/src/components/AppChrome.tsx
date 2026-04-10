"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import DesignDocPanel from "@/components/DesignDocPanel";

interface AppChromeProps {
  children: React.ReactNode;
}

const PANEL_WIDTH = 420;

const navItems = [
  { href: "/", label: "Home" },
  { href: "/edit-lineup", label: "Edit line-up" },
  { href: "/points", label: "Points" },
  { href: "/transactions", label: "Transactions" },
  { href: "/leagues", label: "Leagues" },
  { href: "/schedule", label: "Schedule" },
  { href: "/help", label: "Help" }
];

export default function AppChrome({ children }: AppChromeProps) {
  const pathname = usePathname();
  const [panelOpen, setPanelOpen] = useState(false);

  const activePath = useMemo(() => pathname ?? "/", [pathname]);

  return (
    <div className="min-h-screen bg-surface-base text-txt-strong">
      <header className="shadow-panel">
        <div className="h-4 bg-brand-pink" />
        <div className="bg-[linear-gradient(135deg,#eef0f3_0%,#eceff4_45%,#e7ebf2_100%)]">
          <div className="mx-auto flex w-full max-w-[1400px] items-end justify-between px-5 pb-3 pt-5">
            <div>
              <div className="flex items-end gap-3">
                <div className="flex h-24 w-14 items-center justify-center rounded bg-brand-blue text-2xl font-bold text-white">NBA</div>
                <div>
                  <div className="text-6xl font-semibold uppercase tracking-wide text-[#2d63cf]">Fantasy</div>
                  <p className="-mt-1 text-2xl uppercase tracking-tight text-slate-900">Salary Cap Edition</p>
                </div>
              </div>
            </div>

            <div className="hidden items-end gap-2 md:flex">
              <div className="h-28 w-20 rounded-t-full bg-[radial-gradient(circle_at_30%_30%,#ffffff,transparent_40%),linear-gradient(180deg,#2f4b9a,#0f172a)] opacity-80" />
              <div className="h-32 w-24 rounded-t-full bg-[radial-gradient(circle_at_30%_30%,#ffffff,transparent_40%),linear-gradient(180deg,#facc15,#92400e)]" />
              <div className="h-28 w-20 rounded-t-full bg-[radial-gradient(circle_at_30%_30%,#ffffff,transparent_40%),linear-gradient(180deg,#38bdf8,#1e3a8a)]" />
            </div>
          </div>
        </div>

        <nav className="bg-brand-blue">
          <div className="mx-auto flex w-full max-w-[1400px] overflow-x-auto px-5">
            {navItems.map((item) => {
              const isActive = item.href === "/" ? activePath === "/" : activePath.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`mr-1 border-x border-t border-[#0f2d65] px-5 py-3 text-sm font-semibold whitespace-nowrap transition ${
                    isActive
                      ? "bg-brand-yellow text-slate-900"
                      : "bg-white text-slate-900 hover:bg-slate-100"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      <main
        className="mx-auto w-full max-w-[1400px] px-5 py-5 transition-all duration-300"
        style={{ marginRight: panelOpen ? PANEL_WIDTH : 0 }}
      >
        {children}
      </main>

      <DesignDocPanel open={panelOpen} onOpenChange={setPanelOpen} width={PANEL_WIDTH} />
    </div>
  );
}

