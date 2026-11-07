import {
  createProtocolActivationDocument,
  createProtocolFeatureAnnouncementDocument,
  createProtocolPasswordResetDocument,
  createProtocolProductUpdateDocument,
  createProtocolSubscriptionConfirmationDocument,
  createProtocolSubscriptionUpdateDocument,
  createProtocolTextOnlyDocument,
  createProtocolWelcomeDocument,
} from "./protocol";
import { checkTemplate } from "./test-support";

checkTemplate("Protocol welcome", createProtocolWelcomeDocument);
checkTemplate("Protocol activation", createProtocolActivationDocument);
checkTemplate("Protocol feature announcement", createProtocolFeatureAnnouncementDocument);
checkTemplate("Protocol password reset", createProtocolPasswordResetDocument);
checkTemplate("Protocol product update", createProtocolProductUpdateDocument);
checkTemplate("Protocol subscription confirmation", createProtocolSubscriptionConfirmationDocument);
checkTemplate("Protocol subscription update", createProtocolSubscriptionUpdateDocument);
checkTemplate("Protocol text only", createProtocolTextOnlyDocument);
