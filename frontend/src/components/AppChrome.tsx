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
  { href: "/standing", label: "Standing" },
  { href: "/schedule", label: "Schedule" },
  { href: "/help", label: "Help" }
];

export default function AppChrome({ children }: AppChromeProps) {
  const pathname = usePathname();
  const [panelOpen, setPanelOpen] = useState(false);

  const activePath = useMemo(() => pathname ?? "/", [pathname]);

  return (
    <div className="min-h-screen bg-surface-base text-txt-strong">
      <header className="nba-site-header">
        <div className="h-[18px] bg-brand-pink" />

        <div className="nba-hero">
          <div className="mx-auto flex min-h-[126px] w-full max-w-[1400px] items-center justify-between gap-4 px-4 pb-3 pt-4 sm:px-5 lg:min-h-[146px] lg:pb-4">
            <Link href="/" className="flex min-w-0 items-end gap-2.5 sm:gap-4" aria-label="NBA Fantasy home">
              <img src="/LOGO.png" alt="NBA logo" className="h-[56px] w-auto shrink-0 object-contain sm:h-[100px] lg:h-[112px]" />
              <div className="min-w-0 pb-1">
                <div className="nba-wordmark text-[2.15rem] sm:text-[4.7rem] lg:text-[5.5rem]">Fantasy</div>
                <p className="-mt-1 text-[0.82rem] font-bold uppercase leading-none tracking-tight text-[#111] sm:text-[1.65rem]">
                  Salary Cap Edition
                </p>
              </div>
            </Link>
          </div>
        </div>

        <nav className="bg-brand-darkBlue">
          <div className="mx-auto flex w-full max-w-[1400px] overflow-x-auto px-3 pt-2 sm:px-5">
            {navItems.map((item) => {
              const isActive = item.href === "/" ? activePath === "/" : activePath.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`ism-nav__tab ${isActive ? "active" : ""}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[1400px] px-3 py-5 transition-all duration-300 sm:px-5">
        {children}
      </main>

      <DesignDocPanel open={panelOpen} onOpenChange={setPanelOpen} width={PANEL_WIDTH} />
    </div>
  );
}
