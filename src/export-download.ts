export type ExportFormat = "html" | "mjml";

/** Start a local download without sending the document to another service. */
export function downloadEmailSource(format: ExportFormat, source: string) {
  const mime = format === "html" ? "text/html;charset=utf-8" : "application/xml;charset=utf-8";
  const url = URL.createObjectURL(new Blob([source], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `email.${format}`;
  link.hidden = true;
  try {
    document.body.append(link);
    link.click();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  } finally {
    link.remove();
  }
  // Give the browser time to start reading the Blob, including after dismissal.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
