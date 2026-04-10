import type { Metadata } from "next";
import { Oswald, Rajdhani } from "next/font/google";
import AppChrome from "@/components/AppChrome";
import "./globals.css";

const headingFont = Oswald({ subsets: ["latin"], variable: "--font-heading" });
const bodyFont = Rajdhani({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "NBA Playoff Fantasy",
  description: "Playoff fantasy game prototype"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${headingFont.variable} ${bodyFont.variable}`}>
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}

