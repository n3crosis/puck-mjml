import type { EmailDocument } from "./types";
import { loadMjmlTemplate } from "./templates/loader";
import source from "../templates/02-Matte/product-update.mjml?raw";

/** The default example is imported from its canonical, editable MJML source. */
export function createProductUpdateDocument(): EmailDocument {
  return loadMjmlTemplate(source, "02-Matte/product-update.mjml");
}
