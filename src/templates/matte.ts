import type { EmailDocument } from "../types";
import { loadMjmlTemplate } from "./loader";
import welcomeSource from "../../templates/02-Matte/welcome.mjml?raw";
import activationSource from "../../templates/02-Matte/activation.mjml?raw";
import featureAnnouncementSource from "../../templates/02-Matte/feature-announcement.mjml?raw";
import passwordResetSource from "../../templates/02-Matte/password-reset.mjml?raw";
import productUpdateSource from "../../templates/02-Matte/product-update.mjml?raw";
import subscriptionConfirmationSource from "../../templates/02-Matte/subscription-confirmation.mjml?raw";
import subscriptionUpdateSource from "../../templates/02-Matte/subscription-update.mjml?raw";
import textOnlySource from "../../templates/02-Matte/text-only.mjml?raw";

// Compatibility adapters only. All email content, styles, and fonts live in .mjml.
export function createMatteWelcomeDocument(): EmailDocument {
  return loadMjmlTemplate(welcomeSource, "02-Matte/welcome.mjml");
}

export function createMatteActivationDocument(): EmailDocument {
  return loadMjmlTemplate(activationSource, "02-Matte/activation.mjml");
}

export function createMatteFeatureAnnouncementDocument(): EmailDocument {
  return loadMjmlTemplate(featureAnnouncementSource, "02-Matte/feature-announcement.mjml");
}

export function createMattePasswordResetDocument(): EmailDocument {
  return loadMjmlTemplate(passwordResetSource, "02-Matte/password-reset.mjml");
}

export function createMatteProductUpdateDocument(): EmailDocument {
  return loadMjmlTemplate(productUpdateSource, "02-Matte/product-update.mjml");
}

export function createMatteSubscriptionConfirmationDocument(): EmailDocument {
  return loadMjmlTemplate(
    subscriptionConfirmationSource,
    "02-Matte/subscription-confirmation.mjml",
  );
}

export function createMatteSubscriptionUpdateDocument(): EmailDocument {
  return loadMjmlTemplate(subscriptionUpdateSource, "02-Matte/subscription-update.mjml");
}

export function createMatteTextOnlyDocument(): EmailDocument {
  return loadMjmlTemplate(textOnlySource, "02-Matte/text-only.mjml");
}
