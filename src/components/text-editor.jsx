import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Image from "@tiptap/extension-image";
import { ReactNodeViewRenderer } from "@tiptap/react";
import ImageNodeView from "./image-node-view";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import {
  Table,
  TableRow,
  TableCell,
  TableHeader,
} from "@tiptap/extension-table";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect } from "react";
import {
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  ListIcon,
  ListOrderedIcon,
  ImageIcon,
  TableIcon,
  RedoIcon,
  UndoIcon,
  Trash2,
} from "lucide-react";

const VariableHighlight = Extension.create({
  name: "variableHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("variableHighlight"),
        props: {
          decorations(state) {
            const decorations = [];
            const regex = /\{\{([^}]+)\}\}/g;

            state.doc.descendants((node, pos) => {
              if (node.isText) {
                let match;
                while ((match = regex.exec(node.text)) !== null) {
                  const start = pos + match.index;
                  const end = start + match[0].length;
                  const innerText = match[1];

                  // Hide opening {{
                  decorations.push(
                    Decoration.inline(start, start + 2, {
                      class: "text-[0px] select-none opacity-0 invisible inline-block w-0",
                    })
                  );

                  // Style inner variable name as the chip
                  decorations.push(
                    Decoration.inline(start + 2, end - 2, {
                      class:
                        "font-bengali inline-block bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 rounded px-1.5 py-0.5 mx-0.5 text-xs border border-neutral-300 dark:border-neutral-700 font-normal",
                    })
                  );

                  // Hide closing }}
                  decorations.push(
                    Decoration.inline(end - 2, end, {
                      class: "text-[0px] select-none opacity-0 invisible inline-block w-0",
                    })
                  );
                }
              }
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

export default function TextEditor({
  value,
  onChange,
  placeholder = "মূল লেখা...",
  onRemoveAttachment,
}) {
  const CustomImage = Image.extend({
    addNodeView() {
      return ReactNodeViewRenderer(ImageNodeView);
    },
  });

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      VariableHighlight,
      CustomImage,
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableCell,
      TableHeader,
      Placeholder.configure({
        placeholder,
      }),
    ],

    content: value,

    editorProps: {
      attributes: {
        class:
          "min-h-30 border-b font-bengali focus:outline-none " +
          "[&_img]:my-4 [&_img]:mx-auto [&_img]:max-w-[90%] [&_img]:h-auto " +
          "[&_table]:my-6 [&_table]:mx-auto [&_table]:border-collapse " +
          "[&_ul]:list-disc [&_ol]:list-decimal [&_ul,&_ol]:pl-5 [&_ol,&_ul]:my-2",
      },
    },

    onUpdate({ editor }) {
      onChange?.(editor.getJSON());
    },
  });

  useEffect(() => {
    if (!editor) return;

    const current = editor.getJSON();

    if (JSON.stringify(current) !== JSON.stringify(value)) {
      editor.commands.setContent(
        value || {
          type: "doc",
          content: [
            {
              type: "paragraph",
            },
          ],
        }
      );
    }
  }, [value, editor]);

  if (!editor) return null;

  const insertImage = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        editor
          .chain()
          .focus()
          .insertContent([
            {
              type: "image",
              attrs: {
                src: reader.result,
              },
            },
            {
              type: "paragraph",
              attrs: {
                textAlign: "center",
              },
              content: [
                {
                  type: "text",
                  text: "ছবির ক্যাপশন",
                },
              ],
            },
            {
              type: "paragraph",
            },
          ])
          .run();
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const insertTable = () => {
    const rows = Number(prompt("Rows?")) || 2;
    const cols = Number(prompt("Columns?")) || 2;

    editor
      .chain()
      .focus()
      .insertTable({
        rows,
        cols,
        withHeaderRow: true,
      })
      .run();
  };

  return (
    <div>
      <EditorContent editor={editor} placeholder={placeholder} />

      <div className="flex flex-wrap gap-0.5 py-2 items-center">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <BoldIcon />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <ItalicIcon />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <ListIcon />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrderedIcon />
        </button>

        <button type="button" onClick={insertImage}>
          <ImageIcon />
        </button>

        <button type="button" onClick={insertTable}>
          <TableIcon />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().undo().run()}
        >
          <UndoIcon />
        </button>

        <button
          type="button"
          onClick={() => editor.chain().focus().redo().run()}
        >
          <RedoIcon />
        </button>

        {onRemoveAttachment && (
          <button type="button" onClick={onRemoveAttachment}>
            <Trash2 />
          </button>
        )}
      </div>
    </div>
  );
}