import type { EmailDocument } from "../types";
import { loadMjmlTemplate } from "./loader";
import welcomeSource from "../../templates/03-Protocol/welcome.mjml?raw";
import activationSource from "../../templates/03-Protocol/activation.mjml?raw";
import featureAnnouncementSource from "../../templates/03-Protocol/feature-announcement.mjml?raw";
import passwordResetSource from "../../templates/03-Protocol/password-reset.mjml?raw";
import productUpdateSource from "../../templates/03-Protocol/product-update.mjml?raw";
import subscriptionConfirmationSource from "../../templates/03-Protocol/subscription-confirmation.mjml?raw";
import subscriptionUpdateSource from "../../templates/03-Protocol/subscription-update.mjml?raw";
import textOnlySource from "../../templates/03-Protocol/text-only.mjml?raw";

// Compatibility adapters only. All email content, styles, and fonts live in .mjml.
export function createProtocolWelcomeDocument(): EmailDocument {
  return loadMjmlTemplate(welcomeSource, "03-Protocol/welcome.mjml");
}

export function createProtocolActivationDocument(): EmailDocument {
  return loadMjmlTemplate(activationSource, "03-Protocol/activation.mjml");
}

export function createProtocolFeatureAnnouncementDocument(): EmailDocument {
  return loadMjmlTemplate(featureAnnouncementSource, "03-Protocol/feature-announcement.mjml");
}

export function createProtocolPasswordResetDocument(): EmailDocument {
  return loadMjmlTemplate(passwordResetSource, "03-Protocol/password-reset.mjml");
}

export function createProtocolProductUpdateDocument(): EmailDocument {
  return loadMjmlTemplate(productUpdateSource, "03-Protocol/product-update.mjml");
}

export function createProtocolSubscriptionConfirmationDocument(): EmailDocument {
  return loadMjmlTemplate(
    subscriptionConfirmationSource,
    "03-Protocol/subscription-confirmation.mjml",
  );
}

export function createProtocolSubscriptionUpdateDocument(): EmailDocument {
  return loadMjmlTemplate(subscriptionUpdateSource, "03-Protocol/subscription-update.mjml");
}

export function createProtocolTextOnlyDocument(): EmailDocument {
  return loadMjmlTemplate(textOnlySource, "03-Protocol/text-only.mjml");
}
