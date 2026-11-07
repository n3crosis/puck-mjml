import { useLayoutEffect, useRef, useState, type ChangeEvent } from "react";

export function ImageSourceField({
  id,
  value,
  onChange,
  upload,
  readOnly = false,
}: {
  id: string;
  value: unknown;
  onChange: (value: string) => void;
  upload?: (file: File) => Promise<string>;
  readOnly?: boolean;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const latest = useRef({ onChange, readOnly });
  latest.current = { onChange, readOnly };
  // Selection changes remount this field by id. External updates, undo, locks,
  // and unmounting invalidate uploads without attempting to cancel host work.
  useLayoutEffect(() => {
    request.current++;
    setBusy(false);
    setError("");
    return () => {
      request.current++;
    };
  }, [id, value, readOnly]);
  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || !upload || latest.current.readOnly) return;
    const token = ++request.current;
    setBusy(true);
    setError("");
    try {
      const url = await upload(file);
      if (token !== request.current || latest.current.readOnly) return;
      const parsed = new URL(url);
      if (
        !["http:", "https:"].includes(parsed.protocol) ||
        !parsed.hostname ||
        parsed.username ||
        parsed.password
      )
        throw new Error("Upload must return a public HTTP or HTTPS URL");
      latest.current.onChange(parsed.href);
    } catch (cause) {
      if (token === request.current)
        setError(cause instanceof Error ? cause.message : "Upload failed");
    } finally {
      if (token === request.current) setBusy(false);
      input.value = "";
    }
  };
  return (
    <div className="pm-field">
      <label htmlFor={id}>Image URL</label>
      <input
        id={id}
        type="url"
        value={String(value ?? "")}
        readOnly={readOnly}
        onChange={(event) => {
          if (latest.current.readOnly) return;
          request.current++;
          setBusy(false);
          setError("");
          latest.current.onChange(event.target.value);
        }}
        placeholder="https://example.com/image.png"
      />
      {upload && (
        <label className="pm-upload">
          {busy ? "Uploading…" : "Upload image"}
          <input type="file" accept="image/*" disabled={readOnly || busy} onChange={handleFile} />
        </label>
      )}
      {error && <small role="alert">{error}</small>}
    </div>
  );
}
