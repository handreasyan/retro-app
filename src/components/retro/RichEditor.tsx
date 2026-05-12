"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { Bold, Italic, List, ListOrdered, UnderlineIcon, Palette } from "lucide-react";
import { useEffect, useRef } from "react";

export function RichEditor({
  text,
  richText,
  onChange,
}: {
  text: string;
  richText: unknown;
  onChange: (text: string, richText: unknown) => void;
}) {
  const colorRef = useRef<HTMLInputElement | null>(null);
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
    ],
    content: (richText as object | undefined) ?? (text ? text : "<p></p>"),
    onUpdate: ({ editor }) => {
      const json = editor.getJSON();
      const plain = editor.getText();
      onChange(plain, json);
    },
    immediatelyRender: false,
  });

  useEffect(() => () => editor?.destroy(), [editor]);

  if (!editor) return null;

  function btn(active: boolean) {
    return `p-1.5 rounded ${active ? "bg-[var(--color-bg)] text-[var(--color-fg)]" : "text-[var(--color-muted)] hover:bg-[var(--color-bg)]"}`;
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]">
      <div className="flex items-center gap-1 px-2 py-1 border-b border-[var(--color-border)] flex-wrap">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive("bold"))} aria-label="Bold"><Bold size={14} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive("italic"))} aria-label="Italic"><Italic size={14} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={btn(editor.isActive("underline"))} aria-label="Underline"><UnderlineIcon size={14} /></button>
        <span className="mx-1 h-4 w-px bg-[var(--color-border)]" />
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive("bulletList"))} aria-label="Bullets"><List size={14} /></button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive("orderedList"))} aria-label="Numbered"><ListOrdered size={14} /></button>
        <span className="mx-1 h-4 w-px bg-[var(--color-border)]" />
        <span className="relative inline-flex">
          <button type="button" onClick={() => colorRef.current?.click()} className={btn(false)} aria-label="Color"><Palette size={14} /></button>
          {/* Native color picker anchors to this input's screen position, so we
              keep it in-flow (absolute, behind the button) instead of hidden. */}
          <input
            ref={colorRef}
            type="color"
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
            className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
            tabIndex={-1}
            aria-hidden
          />
        </span>
      </div>
      <EditorContent editor={editor} className="prose prose-sm dark:prose-invert max-w-none p-2 min-h-24 focus:outline-none [&_.ProseMirror]:focus:outline-none [&_.ProseMirror]:min-h-20 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5" />
    </div>
  );
}
