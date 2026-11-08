import { useId, useLayoutEffect, useRef, useState, type ChangeEvent } from "react";
import { readNativeAttributes } from "./native-attributes";
import {
  IMAGE_UPLOAD_ACCEPT,
  LOCAL_IMAGE_WARNING,
  readUploadImage,
  safeImageSource,
} from "./image-upload";

export function ImageSourceField({
  id,
  value,
  onChange,
  upload,
  readOnly = false,
  allowLocalImages = false,
  validateSource,
  validationError,
}: {
  id: string;
  value: unknown;
  onChange: (value: string) => void;
  upload?: (file: File) => Promise<string>;
  readOnly?: boolean;
  allowLocalImages?: boolean;
  /** Optional owning-layout preflight. Throw to leave the current image intact. */
  validateSource?: (source: string, kind: "input" | "upload") => void;
  /** Current owning-layout errors remain visible without remounting this field. */
  validationError?: string;
}) {
  // Puck mounts hidden and visible field instances with the same supplied id.
  // Labels and help text must belong to this rendered instance, not its sibling.
  const instanceId = useId();
  const inputId = `${id}-${instanceId}`;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const latest = useRef({ onChange, readOnly, upload, allowLocalImages, validateSource });
  latest.current = { onChange, readOnly, upload, allowLocalImages, validateSource };
  const uploadEnabled = Boolean(upload);
  // Selection changes remount this field by id. External updates, undo, locks,
  // host policy changes, and unmounting invalidate uploads without claiming to
  // cancel host work that may already be running.
  useLayoutEffect(() => {
    request.current++;
    setBusy(false);
    setError("");
    return () => {
      request.current++;
    };
  }, [id, value, readOnly, uploadEnabled, allowLocalImages]);
  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Reset immediately. An older async completion must not clear a newer file.
    input.value = "";
    if (!file || !latest.current.upload || latest.current.readOnly) return;
    const token = ++request.current;
    setBusy(true);
    setError("");
    try {
      await readUploadImage(file);
      if (token !== request.current || latest.current.readOnly || !latest.current.upload) return;
      const result = await latest.current.upload(file);
      if (token !== request.current || latest.current.readOnly) return;
      const url = safeImageSource(result, latest.current.allowLocalImages);
      if (!url)
        throw new Error(
          allowLocalImages
            ? "Upload must return an HTTP(S) URL or a supported embedded raster image"
            : "Upload must return a public HTTP or HTTPS URL",
        );
      readNativeAttributes("mj-image", [{ name: "src", value: url }], {
        allowLocalImages: latest.current.allowLocalImages,
      });
      latest.current.validateSource?.(url, "upload");
      latest.current.onChange(url);
    } catch (cause) {
      if (token === request.current)
        setError(
          cause instanceof Error && cause.message
            ? cause.message
            : "Image upload failed. Try again.",
        );
    } finally {
      if (token === request.current) setBusy(false);
    }
  };
  const description = `${inputId}-upload-help`;
  const errorId = `${inputId}-upload-error`;
  const visibleError = validationError || error;
  return (
    <div className="pm-field" aria-busy={busy}>
      <label htmlFor={inputId}>Image URL</label>
      <input
        id={inputId}
        type="url"
        value={String(value ?? "")}
        readOnly={readOnly}
        aria-describedby={
          [upload ? description : "", visibleError ? errorId : ""].filter(Boolean).join(" ") ||
          undefined
        }
        onChange={(event) => {
          if (latest.current.readOnly) return;
          request.current++;
          setBusy(false);
          setError("");
          try {
            latest.current.validateSource?.(event.target.value, "input");
            latest.current.onChange(event.target.value);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Image exceeds this layout's limits");
          }
        }}
        placeholder="https://example.com/image.png"
      />
      {upload && (
        <>
          <label className="pm-upload" aria-disabled={readOnly || busy}>
            {busy ? "Uploading…" : "Upload image"}
            <input
              aria-label="Upload image"
              aria-describedby={[description, visibleError ? errorId : ""]
                .filter(Boolean)
                .join(" ")}
              aria-invalid={visibleError ? true : undefined}
              type="file"
              accept={IMAGE_UPLOAD_ACCEPT}
              disabled={readOnly || busy}
              onChange={handleFile}
            />
          </label>
          <span className="pm-upload-help" id={description}>
            PNG, JPEG, GIF or WebP. Up to 5 MiB, 8192 pixels per side and 16 megapixels.
            {allowLocalImages
              ? ` ${LOCAL_IMAGE_WARNING}`
              : " You can also paste a hosted image URL above."}
          </span>
        </>
      )}
      {busy && (
        <span role="status" aria-live="polite">
          Uploading image…
        </span>
      )}
      {visibleError && (
        <small id={errorId} role="alert">
          {visibleError}
        </small>
      )}
    </div>
  );
}
