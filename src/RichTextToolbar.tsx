import { useCallback, useState, useSyncExternalStore } from "react";
import { RichTextMenu, type Field } from "@puckeditor/core";
import { LinkIcon } from "@phosphor-icons/react/dist/csr/Link";
import { safeRichTextUrl } from "./richtext";

type RichTextField = Extract<Field, { type: "richtext" }>;
type MenuProps = Parameters<NonNullable<RichTextField["renderInlineMenu"]>>[0];

/** Puck's default editor selector does not include links, so observe them directly. */
function useLinkActive(editor: MenuProps["editor"]) {
  const subscribeToLinks = useCallback(
    (onChange: () => void) => {
      editor?.on("transaction", onChange);
      editor?.on("destroy", onChange);
      return () => {
        editor?.off("transaction", onChange);
        editor?.off("destroy", onChange);
      };
    },
    [editor],
  );
  const getLinkActive = useCallback(
    () => Boolean(editor && !editor.isDestroyed && editor.isActive("link")),
    [editor],
  );
  return useSyncExternalStore(subscribeToLinks, getLinkActive, getLinkActive);
}

function LinkMenuControl({ editor, readOnly }: Pick<MenuProps, "editor" | "readOnly">) {
  const [editingLink, setEditingLink] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const linkActive = useLinkActive(editor);
  const closeLink = () => {
    setEditingLink(false);
    setError("");
    editor?.commands.focus();
  };
  const applyLink = () => {
    if (!editor || readOnly) return;
    const href = safeRichTextUrl(url);
    if (!href) {
      setError("Enter an HTTP, HTTPS, mailto, or tel URL.");
      return;
    }
    const attrs = { href, target: "_blank", rel: "noopener noreferrer" };
    if (editor.state.selection.empty && !editor.isActive("link")) {
      editor
        .chain()
        .focus()
        .insertContent({ type: "text", text: href, marks: [{ type: "link", attrs }] })
        .run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink(attrs).run();
    }
    setEditingLink(false);
    setError("");
  };
  return (
    <RichTextMenu.Group>
      <RichTextMenu.Control
        icon={<LinkIcon size={16} aria-hidden="true" />}
        title={linkActive ? "Edit link" : "Add link"}
        disabled={!editor || readOnly}
        active={linkActive || editingLink}
        onClick={(event) => {
          event.stopPropagation();
          setUrl(String(editor?.getAttributes("link").href ?? ""));
          setError("");
          setEditingLink((open) => !open);
        }}
      />
      {editingLink && (
        <div
          className="pm-richtext-link"
          role="group"
          aria-label="Edit link"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Escape") {
              event.preventDefault();
              closeLink();
            }
          }}
        >
          <label>
            Link URL
            <input
              type="text"
              inputMode="url"
              value={url}
              placeholder="https://example.com"
              disabled={readOnly}
              autoFocus
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing) return;
                if (event.key === "Enter") {
                  event.preventDefault();
                  applyLink();
                }
              }}
            />
          </label>
          <div className="pm-richtext-link-actions">
            <button type="button" disabled={readOnly} onClick={applyLink}>
              Apply
            </button>
            {linkActive && (
              <button
                type="button"
                disabled={readOnly}
                onClick={() => {
                  editor?.chain().focus().extendMarkRange("link").unsetLink().run();
                  closeLink();
                }}
              >
                Remove link
              </button>
            )}
            <button type="button" onClick={closeLink}>
              Cancel
            </button>
          </div>
          {error && <small role="alert">{error}</small>}
        </div>
      )}
    </RichTextMenu.Group>
  );
}

function EmailRichTextMenu({ editor, readOnly }: MenuProps) {
  return (
    <div className="pm-richtext-toolbar">
      <RichTextMenu>
        <RichTextMenu.Group>
          <RichTextMenu.HeadingSelect />
          <RichTextMenu.ListSelect />
          <RichTextMenu.AlignSelect />
        </RichTextMenu.Group>
        <RichTextMenu.Group>
          <RichTextMenu.Bold />
          <RichTextMenu.Italic />
          <RichTextMenu.Underline />
          <RichTextMenu.Strikethrough />
        </RichTextMenu.Group>
        <RichTextMenu.Group>
          <RichTextMenu.Blockquote />
          <RichTextMenu.InlineCode />
          <RichTextMenu.CodeBlock />
          <RichTextMenu.HorizontalRule />
        </RichTextMenu.Group>
        <LinkMenuControl editor={editor} readOnly={readOnly} />
      </RichTextMenu>
    </div>
  );
}

/**
 * Puck renders the inline menu inside the focused block's selection overlay, so
 * it stays in the dark action bar and wraps within the selected block. The
 * full menu remains available in the sidebar.
 */
function EmailInlineRichTextMenu({ editor, readOnly }: MenuProps) {
  return (
    <div className="pm-richtext-toolbar pm-richtext-toolbar--inline">
      <RichTextMenu>
        <RichTextMenu.Group>
          <RichTextMenu.Bold />
          <RichTextMenu.Italic />
          <RichTextMenu.Underline />
          <RichTextMenu.Strikethrough />
        </RichTextMenu.Group>
        <LinkMenuControl editor={editor} readOnly={readOnly} />
      </RichTextMenu>
    </div>
  );
}

export const renderEmailRichTextMenu: NonNullable<RichTextField["renderMenu"]> = (props) => (
  <EmailRichTextMenu {...props} />
);

export const renderEmailInlineMenu: NonNullable<RichTextField["renderInlineMenu"]> = (props) => (
  <EmailInlineRichTextMenu {...props} />
);
