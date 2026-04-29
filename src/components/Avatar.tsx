"use client";
import { useState } from "react";
import { PLACEHOLDER_AVATAR } from "@/lib/personas";

export function Avatar({ src, alt, size = 32, className = "" }: { src: string; alt: string; size?: number; className?: string }) {
  const [errored, setErrored] = useState(false);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={errored ? PLACEHOLDER_AVATAR : src}
      alt={alt}
      width={size}
      height={size}
      onError={() => setErrored(true)}
      className={`rounded-full bg-[var(--color-blur)] object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
