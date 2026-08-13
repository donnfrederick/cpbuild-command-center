"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { useEffect } from "react";
import { sanitizeAnnouncementHtml } from "@/lib/announcements/sanitize-announcement-html";
import { useTranslations } from "next-intl";
import { Bold, Italic, Link2, List, ListOrdered, ImagePlus } from "lucide-react";

interface AnnouncementRichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  uploadFolderHint?: string;
  disabled?: boolean;
}

export function AnnouncementRichTextEditor({
  value,
  onChange,
  uploadFolderHint = "draft",
  disabled = false,
}: AnnouncementRichTextEditorProps) {
  const t = useTranslations("admin.announcements");

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Link.configure({ openOnClick: false, autolink: true }),
      Image.configure({ inline: true }),
    ],
    content: sanitizeAnnouncementHtml(value) || "<p></p>",
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    const normalized = sanitizeAnnouncementHtml(value) || "<p></p>";
    const current = editor.getHTML();
    if (normalized !== current) {
      editor.commands.setContent(normalized, { emitUpdate: false });
    }
  }, [editor, value]);

  const insertImage = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp,image/gif";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file || !editor) return;
      const form = new FormData();
      form.append("image", file);
      form.append("folderHint", uploadFolderHint);
      const res = await fetch("/api/admin/announcements/upload-image", { method: "POST", body: form });
      if (!res.ok) return;
      const data = (await res.json()) as { url: string };
      editor.chain().focus().setImage({ src: data.url, alt: "" }).run();
    };
    input.click();
  };

  if (!editor) return null;

  return (
    <div
      style={{
        border: "1px solid var(--neutral-200)",
        borderRadius: 8,
        overflow: "hidden",
        backgroundColor: "var(--neutral-0)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          padding: "6px 8px",
          borderBottom: "1px solid var(--neutral-200)",
          backgroundColor: "var(--neutral-50)",
        }}
      >
        <ToolbarButton
          pressed={editor.isActive("bold")}
          label={t("toolbarBold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={16} aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          pressed={editor.isActive("italic")}
          label={t("toolbarItalic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={16} aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          pressed={editor.isActive("bulletList")}
          label={t("toolbarBulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={16} aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          pressed={editor.isActive("orderedList")}
          label={t("toolbarNumberedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={16} aria-hidden />
        </ToolbarButton>
        <ToolbarButton
          pressed={editor.isActive("link")}
          label={t("toolbarLink")}
          onClick={() => {
            const prev = editor.getAttributes("link").href as string | undefined;
            const url = window.prompt(t("linkPrompt"), prev ?? "https://");
            if (url === null) return;
            if (url === "") {
              editor.chain().focus().extendMarkRange("link").unsetLink().run();
              return;
            }
            editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
          }}
        >
          <Link2 size={16} aria-hidden />
        </ToolbarButton>
        <ToolbarButton label={t("toolbarImage")} onClick={() => void insertImage()}>
          <ImagePlus size={16} aria-hidden />
        </ToolbarButton>
      </div>
      <EditorContent
        editor={editor}
        style={{
          padding: "10px 12px",
          minHeight: 120,
          fontSize: 14,
          lineHeight: 1.45,
          color: "var(--neutral-800)",
        }}
      />
    </div>
  );
}

function ToolbarButton({
  children,
  label,
  onClick,
  pressed,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        padding: 0,
        border: "none",
        borderRadius: 6,
        backgroundColor: pressed ? "var(--primary-100)" : "transparent",
        color: "var(--neutral-700)",
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}
