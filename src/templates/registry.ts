import { createEmptyDocument } from "../document";
import { createProductUpdateDocument } from "../example";
import type { EmailDocument } from "../types";
import * as matte from "./matte";
import * as protocol from "./protocol";

export interface EmailTemplateDefinition {
  /** Stable slug, for example "02-matte/welcome". */
  id: string;
  /** Display group shown in the demo picker; empty string renders ungrouped. */
  group: string;
  label: string;
  create: () => EmailDocument;
}

function nameToSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
type EntryInput = readonly [
  group: string,
  slug: string,
  label: string,
  create: () => EmailDocument,
];
const entries = (...rows: readonly EntryInput[]): EmailTemplateDefinition[] =>
  rows.map(([group, slug, label, create]) => ({
    id: `${slug}/${nameToSlug(label)}`,
    group,
    label,
    create,
  }));

// Ported so far: 02-Matte and 03-Protocol (mirrors of demo.react.email).
// TODO resume porting: 01-Barebone, 04-Arcane, 05-Studio (9 templates each)
// and the Community batches (22 templates) into src/templates/<family>.ts,
// then import them here and raise the registry test floor back to 60.
/** Every template available in the demo picker, mirroring demo.react.email. */
export const emailTemplates: readonly EmailTemplateDefinition[] = [
  { id: "blank", group: "", label: "Blank email", create: createEmptyDocument },
  ...entries(
    ["02-Matte", "02-matte", "Welcome", matte.createMatteWelcomeDocument],
    ["02-Matte", "02-matte", "Activation", matte.createMatteActivationDocument],
    ["02-Matte", "02-matte", "Feature announcement", matte.createMatteFeatureAnnouncementDocument],
    ["02-Matte", "02-matte", "Password reset", matte.createMattePasswordResetDocument],
    ["02-Matte", "02-matte", "Product update", createProductUpdateDocument],
    [
      "02-Matte",
      "02-matte",
      "Subscription confirmation",
      matte.createMatteSubscriptionConfirmationDocument,
    ],
    ["02-Matte", "02-matte", "Subscription update", matte.createMatteSubscriptionUpdateDocument],
    ["02-Matte", "02-matte", "Text only", matte.createMatteTextOnlyDocument],
    ["02-Matte", "02-matte", "Collage fonts", matte.createMatteCollageFontsDocument],
    ["03-Protocol", "03-protocol", "Welcome", protocol.createProtocolWelcomeDocument],
    ["03-Protocol", "03-protocol", "Activation", protocol.createProtocolActivationDocument],
    [
      "03-Protocol",
      "03-protocol",
      "Feature announcement",
      protocol.createProtocolFeatureAnnouncementDocument,
    ],
    ["03-Protocol", "03-protocol", "Password reset", protocol.createProtocolPasswordResetDocument],
    ["03-Protocol", "03-protocol", "Product update", protocol.createProtocolProductUpdateDocument],
    [
      "03-Protocol",
      "03-protocol",
      "Subscription confirmation",
      protocol.createProtocolSubscriptionConfirmationDocument,
    ],
    [
      "03-Protocol",
      "03-protocol",
      "Subscription update",
      protocol.createProtocolSubscriptionUpdateDocument,
    ],
    ["03-Protocol", "03-protocol", "Text only", protocol.createProtocolTextOnlyDocument],
    ["03-Protocol", "03-protocol", "Dither fonts", protocol.createProtocolDitherFontsDocument],
  ),
];
