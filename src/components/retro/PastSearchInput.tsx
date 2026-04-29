"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

export function PastSearchInput() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const initial = params.get("q") ?? "";
  const [value, setValue] = useState(initial);

  // Keep input in sync if the URL changes externally (e.g. router.refresh from sockets)
  useEffect(() => {
    setValue(params.get("q") ?? "");
  }, [params]);

  // Debounced URL update
  useEffect(() => {
    const t = setTimeout(() => {
      const current = params.get("q") ?? "";
      if (value === current) return;
      const next = new URLSearchParams(params.toString());
      if (value.trim()) next.set("q", value);
      else next.delete("q");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }, 250);
    return () => clearTimeout(t);
  }, [value, params, pathname, router]);

  return (
    <input
      type="search"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder="Search by title..."
      className="h-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 text-sm w-full sm:w-72"
    />
  );
}
