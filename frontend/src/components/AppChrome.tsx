"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SyntheticEvent, useMemo, useState } from "react";
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

const heroPlayers = [
  { code: "203507", number: "34", className: "h-[116px] bg-[linear-gradient(180deg,#0b5b3a,#00471b)]" },
  { code: "201939", number: "30", className: "z-[1] -ml-3 h-[132px] bg-[linear-gradient(180deg,#f2c35b,#1d428a)]" },
  { code: "1630162", number: "5", className: "-ml-3 h-[120px] bg-[linear-gradient(180deg,#1d428a,#0c2340)]" }
];

function onHeroImageError(event: SyntheticEvent<HTMLImageElement>, code: string) {
  const image = event.currentTarget;
  if (image.dataset.fallbackApplied !== "true") {
    image.dataset.fallbackApplied = "true";
    image.src = `https://cdn.nba.com/headshots/nba/latest/520x380/${code}.png`;
    return;
  }

  image.hidden = true;
}

export default function AppChrome({ children }: AppChromeProps) {
  const pathname = usePathname();
  const [panelOpen, setPanelOpen] = useState(false);

  const activePath = useMemo(() => pathname ?? "/", [pathname]);

  return (
    <div className="min-h-screen bg-surface-base text-txt-strong">
      <header className="nba-site-header">
        <div className="h-[18px] bg-brand-pink" />

        <div className="nba-hero">
          <div className="mx-auto flex min-h-[126px] w-full max-w-[1400px] items-end justify-between gap-4 px-4 pb-3 pt-4 sm:px-5 lg:min-h-[146px] lg:pb-4">
            <Link href="/" className="flex items-end gap-4" aria-label="NBA Fantasy home">
              <div className="nba-logo-mark">NBA</div>
              <div className="pb-1">
                <div className="nba-wordmark text-[3.4rem] sm:text-[4.7rem] lg:text-[5.5rem]">Fantasy</div>
                <p className="-mt-1 text-[1.35rem] font-bold uppercase leading-none tracking-tight text-[#111] sm:text-[1.65rem]">
                  Salary Cap Edition
                </p>
              </div>
            </Link>

            <div className="hidden h-[132px] items-end gap-0 md:flex" aria-hidden="true">
              {heroPlayers.map((player) => (
                <div key={player.code} className={`nba-hero-player ${player.className}`}>
                  <img
                    src={`/nba/headshots/${player.code}.png`}
                    alt=""
                    onError={(event) => onHeroImageError(event, player.code)}
                  />
                  <span>{player.number}</span>
                </div>
              ))}
            </div>
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

      <main
        className="mx-auto w-full max-w-[1400px] px-3 py-5 transition-all duration-300 sm:px-5"
        style={{ marginRight: panelOpen ? PANEL_WIDTH : 0 }}
      >
        {children}
      </main>

      <DesignDocPanel open={panelOpen} onOpenChange={setPanelOpen} width={PANEL_WIDTH} />
    </div>
  );
}
