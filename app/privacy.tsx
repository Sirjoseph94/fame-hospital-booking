import { LegalPage } from "@/components/legal/legal-page";
import { privacyPolicy } from "@/lib/legal/privacy-policy";

export default function PrivacyScreen() {
  return <LegalPage document={privacyPolicy} path="/privacy" />;
}
