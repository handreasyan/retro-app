"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Sun, Moon, MonitorCog } from "lucide-react";

type Theme = "light" | "dark" | "system";

function applyTheme(t: Theme) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = t === "dark" || (t === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
}

function readSavedTheme(): Theme {
  if (typeof window === "undefined") return "system";
  return (localStorage.getItem("retro:theme") as Theme | null) ?? "system";
}

export function Header() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    setTheme(readSavedTheme());
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem("retro:theme", theme);
    applyTheme(theme);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => theme === "system" && applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  return (
    <header className="border-b border-[var(--color-border)] bg-[var(--color-bg-elev)]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 flex items-center justify-between gap-2">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Retro" className="h-7 w-auto shrink-0" />
          <span className="truncate">Retro</span>
        </Link>
        <div className="flex items-center gap-1 text-[var(--color-muted)]">
          <button
            type="button"
            onClick={() => setTheme("light")}
            className={`p-2 rounded-md hover:bg-[var(--color-bg)] ${theme === "light" ? "text-[var(--color-fg)]" : ""}`}
            aria-label="Light theme"
          >
            <Sun size={16} />
          </button>
          <button
            type="button"
            onClick={() => setTheme("system")}
            className={`p-2 rounded-md hover:bg-[var(--color-bg)] ${theme === "system" ? "text-[var(--color-fg)]" : ""}`}
            aria-label="System theme"
          >
            <MonitorCog size={16} />
          </button>
          <button
            type="button"
            onClick={() => setTheme("dark")}
            className={`p-2 rounded-md hover:bg-[var(--color-bg)] ${theme === "dark" ? "text-[var(--color-fg)]" : ""}`}
            aria-label="Dark theme"
          >
            <Moon size={16} />
          </button>
        </div>
      </div>
    </header>
  );
}
