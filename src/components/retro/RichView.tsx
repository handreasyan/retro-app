"use client";
import { useMemo } from "react";
import { generateHTML } from "@tiptap/html";
import StarterKit from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";

const extensions = [StarterKit, Underline, TextStyle, Color];

export function RichView({ doc, fallbackText }: { doc: unknown; fallbackText: string | null }) {
  const html = useMemo(() => {
    if (!doc) return null;
    try {
      return generateHTML(doc as Parameters<typeof generateHTML>[0], extensions);
    } catch {
      return null;
    }
  }, [doc]);

  if (!html) {
    return <p className="whitespace-pre-wrap break-words">{fallbackText}</p>;
  }
  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none break-words [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
