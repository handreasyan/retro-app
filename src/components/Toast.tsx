"use client";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { create } from "zustand";
import { useEffect } from "react";

type ToastItem = { id: string; title?: string; message: string; variant?: "default" | "danger" | "success" };

type Store = {
  items: ToastItem[];
  push: (t: Omit<ToastItem, "id">) => void;
  dismiss: (id: string) => void;
};

export const useToasts = create<Store>((set) => ({
  items: [],
  push: (t) => set((s) => ({ items: [...s.items, { ...t, id: Math.random().toString(36).slice(2) }] })),
  dismiss: (id) => set((s) => ({ items: s.items.filter((x) => x.id !== id) })),
}));

export function toast(t: Omit<ToastItem, "id">) {
  useToasts.getState().push(t);
}

export function ToastViewport() {
  const items = useToasts((s) => s.items);
  const dismiss = useToasts((s) => s.dismiss);
  // Auto-dismiss timer
  useEffect(() => {
    const timers = items.map((i) =>
      setTimeout(() => dismiss(i.id), 4000)
    );
    return () => { for (const t of timers) clearTimeout(t); };
  }, [items, dismiss]);
  return (
    <ToastPrimitive.Provider>
      {items.map((i) => (
        <ToastPrimitive.Root
          key={i.id}
          className={[
            "fixed bottom-4 right-4 z-50 rounded-lg border px-4 py-3 shadow-soft",
            "data-[state=open]:animate-in data-[state=open]:fade-in",
            i.variant === "danger" ? "bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-900 dark:text-red-200"
              : i.variant === "success" ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-950 dark:border-green-900 dark:text-green-200"
              : "bg-white border-zinc-200 text-zinc-900 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-100",
          ].join(" ")}
          onOpenChange={(o) => !o && dismiss(i.id)}
        >
          {i.title && <ToastPrimitive.Title className="text-sm font-semibold">{i.title}</ToastPrimitive.Title>}
          <ToastPrimitive.Description className="text-sm">{i.message}</ToastPrimitive.Description>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="fixed bottom-0 right-0 flex flex-col gap-2 p-4 w-96 max-w-[100vw] z-50" />
    </ToastPrimitive.Provider>
  );
}
