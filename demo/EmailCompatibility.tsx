import { useEffect, useId, useMemo, useState } from "react";
import { compileEmail } from "../src/export";
import type { CompiledEmail, EmailDocument } from "../src/types";
import {
  analyzeEmailHtml,
  clientResults,
  compatibilityData,
  featureUrl,
  mainstreamClients,
  needsReview,
  supportLabel,
  supportNotes,
  type CompatibilityAnalysis,
  type Feature,
} from "./compatibility/analyze";
import "./compatibility/style.css";

const plainNote = (text: string) => text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/`/g, "");
const messageFor = (error: unknown) =>
  error instanceof Error ? error.message : "Unable to inspect this email.";

type Result = {
  document: EmailDocument;
  attempt: number;
  allowLocalImages: boolean;
  compiled?: CompiledEmail;
  analysis?: CompatibilityAnalysis;
  error?: string;
};

function FeatureDetails({ feature, clientId }: { feature: Feature; clientId: string }) {
  return (
    <div className="compatibility-details">
      {feature.description && <p>{plainNote(feature.description)}</p>}
      <p className="compatibility-muted">
        Feature test date reported by upstream: {feature.lastTestDate}. Client entries can have
        different dates or version numbers.
      </p>
      {feature.notes && <p className="compatibility-callout">{plainNote(feature.notes)}</p>}
      <div
        className="compatibility-client-results"
        aria-label={`Recorded support for ${feature.title}`}
      >
        {clientResults(feature, clientId).map(({ id, label, test, support }) => (
          <dl key={id} className="compatibility-client-result">
            <div>
              <dt>Client</dt>
              <dd>{label}</dd>
            </div>
            <div>
              <dt>Recorded version / date</dt>
              <dd>{test?.version ?? "Not recorded"}</dd>
            </div>
            <div>
              <dt>Support</dt>
              <dd>
                <span className={`compatibility-badge compatibility-badge--${support}`}>
                  {supportLabel[support]}
                </span>
              </dd>
            </div>
            {(!test || supportNotes(feature, test.code).length > 0) && (
              <div>
                <dt>Caveats</dt>
                <dd>
                  {test
                    ? supportNotes(feature, test.code).map((note, index) => (
                        <p key={index}>{plainNote(note)}</p>
                      ))
                    : "No matching result in this snapshot."}
                </dd>
              </div>
            )}
          </dl>
        ))}
      </div>
      <a href={featureUrl(feature.slug)} target="_blank" rel="noopener noreferrer">
        Full support table and tests on Can I email ↗
      </a>
    </div>
  );
}

export function EmailCompatibility({
  document,
  active = true,
  allowLocalImages = false,
  debounceMs = 0,
}: {
  document: EmailDocument;
  active?: boolean;
  allowLocalImages?: boolean;
  /** Delay live sidebar checks while typing; zero keeps explicit checks immediate. */
  debounceMs?: number;
}) {
  const [result, setResult] = useState<Result>();
  const [attempt, setAttempt] = useState(0);
  const [clientId, setClientId] = useState("mainstream");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"detected" | "catalog">("detected");
  const [reviewOnly, setReviewOnly] = useState(true);
  const searchId = useId();
  const clientSelectId = useId();
  const clientCoverageId = useId();
  const current =
    result?.document === document &&
    result.attempt === attempt &&
    result.allowLocalImages === allowLocalImages
      ? result
      : undefined;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const run = () =>
      Promise.resolve()
        .then(() => (cancelled ? undefined : compileEmail(document, { allowLocalImages })))
        .then((compiled) => {
          if (!compiled || cancelled) return;
          const analysis = analyzeEmailHtml(compiled.html);
          setResult({ document, attempt, allowLocalImages, compiled, analysis });
        })
        .catch((error: unknown) => {
          if (!cancelled)
            setResult({ document, attempt, allowLocalImages, error: messageFor(error) });
        });
    const timer = debounceMs > 0 ? window.setTimeout(run, debounceMs) : undefined;
    if (timer === undefined) void run();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [document, attempt, active, allowLocalImages, debounceMs]);

  const detections = useMemo(
    () => new Map(current?.analysis?.detected.map((item) => [item.slug, item])),
    [current?.analysis],
  );
  const detectedFeatures = compatibilityData.features.filter((feature) =>
    detections.has(feature.slug),
  );
  const reviewCount = detectedFeatures.filter((feature) => needsReview(feature, clientId)).length;
  const features = (scope === "detected" ? detectedFeatures : compatibilityData.features).filter(
    (feature) =>
      (!reviewOnly || needsReview(feature, clientId)) &&
      `${feature.title} ${feature.description} ${feature.slug}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const analysis = current?.analysis;
  const singleClient = clientId !== "" && clientId !== "mainstream";
  const clientScopeLabel = singleClient
    ? "this client"
    : clientId === "mainstream"
      ? "mainstream clients"
      : "all recorded clients";

  return (
    <section className="compatibility" aria-label="Email compatibility">
      <header className="compatibility-heading">
        <h2>Email compatibility</h2>
        <p>Static checks of this email, not inbox rendering.</p>
      </header>
      <details className="compatibility-help">
        <summary>How to read these checks</summary>
        <p>
          This is a static check of compiled HTML, not a rendering test. MJML fallbacks can mitigate
          warnings. A supported result does not guarantee the email will look correct. Test your
          important clients before sending.
        </p>
        <p>
          Each feature uses the last listed test for each client in the pinned upstream data.
          Version/date labels are shown below, and can be years old. Outlook Windows refers to the
          recorded classic client tests, not new Outlook.
        </p>
        <a href="https://www.caniemail.com/" target="_blank" rel="noopener noreferrer">
          Explore Can I email ↗
        </a>
      </details>
      <div className="compatibility-controls">
        <label htmlFor={clientSelectId}>
          Email client
          <select
            id={clientSelectId}
            aria-describedby={clientCoverageId}
            value={clientId}
            onChange={(event) => setClientId(event.target.value)}
          >
            <option value="mainstream">Mainstream clients ({mainstreamClients.length})</option>
            <option value="">All recorded clients ({compatibilityData.clients.length})</option>
            {compatibilityData.clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.label}
              </option>
            ))}
          </select>
        </label>
        <p id={clientCoverageId} className="compatibility-muted">
          The mainstream preset covers Apple Mail, Gmail, Outlook, Yahoo Mail and Samsung Email.
          iCloud.com webmail is not in this snapshot; Apple Mail results do not cover it.
        </p>
        <label htmlFor={searchId}>
          Find a feature
          <input
            id={searchId}
            type="search"
            placeholder="Try border-radius, fonts, images…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      {!current && (
        <p role="status" className="compatibility-callout">
          Compiling and inspecting your current email…
        </p>
      )}
      {current?.error && (
        <div role="alert" className="compatibility-error">
          <p>Compatibility analysis failed: {current.error}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>
            Retry analysis
          </button>
        </div>
      )}
      {analysis && (
        <>
          <div className="compatibility-summary" aria-label="Analysis summary">
            <div>
              <strong>{detectedFeatures.length}</strong>
              <span>features detected</span>
            </div>
            <div>
              <strong>{reviewCount}</strong>
              <span>features to review for {clientScopeLabel}</span>
            </div>
            <div>
              <strong>{compatibilityData.features.length}</strong>
              <span>checks in this integration</span>
            </div>
          </div>
          {(analysis.cssParseErrors > 0 ||
            analysis.externalStylesheets > 0 ||
            analysis.hasOutlookFallback ||
            Boolean(current.compiled?.errors.length)) && (
            <details className="compatibility-analysis-notes">
              <summary>Analysis limits and compiler notes</summary>
              <ul>
                {analysis.externalStylesheets > 0 && (
                  <li>
                    {analysis.externalStylesheets} external stylesheet link(s) detected. Their
                    content is not fetched or inspected, including external web fonts.
                  </li>
                )}
                {analysis.cssParseErrors > 0 && (
                  <li>
                    {analysis.cssParseErrors} CSS block(s) could not be parsed. Their features may
                    be missing from the results.
                  </li>
                )}
                {analysis.hasOutlookFallback && (
                  <li>
                    Outlook conditional markup or VML detected. Fallback effectiveness is not
                    evaluated; conditional-only content is not scanned.
                  </li>
                )}
                {current.compiled?.errors.map((error, index) => (
                  <li key={index}>MJML: {error.message}</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      <div className="compatibility-results-toolbar">
        <div role="group" aria-label="Compatibility feature scope">
          <button
            type="button"
            aria-pressed={scope === "detected"}
            onClick={() => setScope("detected")}
          >
            In this email{analysis ? ` (${detectedFeatures.length})` : ""}
          </button>
          <button
            type="button"
            aria-pressed={scope === "catalog"}
            onClick={() => setScope("catalog")}
          >
            Browse {compatibilityData.features.length} checks
          </button>
        </div>
        <label className="compatibility-check">
          <input
            type="checkbox"
            checked={reviewOnly}
            onChange={(event) => setReviewOnly(event.target.checked)}
          />
          Needs review only
        </label>
      </div>
      {(analysis || scope === "catalog") && (
        <p className="compatibility-muted" role="status">
          Showing {features.length}{" "}
          {scope === "detected" ? "detected features" : "catalog features"}.{" "}
          {scope === "catalog" && "Catalog entries are not necessarily present in your email."}
        </p>
      )}
      <div className="compatibility-results">
        {features.map((feature) => {
          const detection = detections.get(feature.slug);
          const results = clientResults(feature, clientId);
          const unsupported = results.filter((entry) => entry.support === "unsupported").length;
          const partial = results.filter((entry) => entry.support === "partial").length;
          const unknown = results.filter((entry) => entry.support === "unknown").length;
          return (
            <details key={`${clientId}:${feature.slug}`} className="compatibility-feature">
              <summary>
                <span>
                  <strong>{feature.title}</strong>
                  <small>
                    {detection ? detection.evidence[0] : "Not detected in current HTML"}
                  </small>
                </span>
                <span className="compatibility-feature-status">
                  {singleClient ? (
                    <span
                      className={`compatibility-badge compatibility-badge--${results[0]?.support ?? "unknown"}`}
                    >
                      {supportLabel[results[0]?.support ?? "unknown"]}
                    </span>
                  ) : (
                    <span>
                      {unsupported} unsupported · {partial} partial · {unknown} unknown
                    </span>
                  )}
                  {needsReview(feature, clientId) && !unsupported && !partial && !unknown && (
                    <small>Read caveats</small>
                  )}
                </span>
              </summary>
              {detection && (
                <div className="compatibility-evidence">
                  <strong>Found in compiled HTML</strong>
                  <ul>
                    {detection.evidence.map((evidence) => (
                      <li key={evidence}>
                        <code>{evidence}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <FeatureDetails feature={feature} clientId={clientId} />
            </details>
          );
        })}
        {features.length === 0 && (analysis || scope === "catalog") && (
          <div className="compatibility-empty">
            <strong>No matching features.</strong>
            <p>
              Try another client, clear the search, or turn off “Needs review only”. This is not an
              all-clear: only the {compatibilityData.features.length} included checks are covered.
            </p>
          </div>
        )}
      </div>
      <footer className="compatibility-footer">
        <p>
          Analysis stays in this browser. Nothing is uploaded to Can I email. Remote images,
          stylesheets, and fonts are not fetched by this check.
        </p>
        <p>
          Data:{" "}
          <a
            href={`${compatibilityData.repository}/tree/${compatibilityData.revision}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Can I email · {compatibilityData.revision.slice(0, 7)}
          </a>
          , MIT, © 2019 Rémi Parmentier. This integration covers a curated subset, not the full Can
          I email catalog. Links open the live site, which may have newer results.
        </p>
      </footer>
    </section>
  );
}
