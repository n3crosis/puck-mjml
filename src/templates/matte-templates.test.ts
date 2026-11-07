import {
  createMatteActivationDocument,
  createMatteFeatureAnnouncementDocument,
  createMattePasswordResetDocument,
  createMatteSubscriptionConfirmationDocument,
  createMatteSubscriptionUpdateDocument,
  createMatteTextOnlyDocument,
} from "./matte";
import { checkTemplate } from "./test-support";

checkTemplate("Matte activation", createMatteActivationDocument);
checkTemplate("Matte feature announcement", createMatteFeatureAnnouncementDocument);
checkTemplate("Matte password reset", createMattePasswordResetDocument);
checkTemplate("Matte subscription confirmation", createMatteSubscriptionConfirmationDocument);
checkTemplate("Matte subscription update", createMatteSubscriptionUpdateDocument);
checkTemplate("Matte text only", createMatteTextOnlyDocument);
