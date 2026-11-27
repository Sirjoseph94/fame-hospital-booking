import { LegalPage } from "@/components/legal/legal-page";
import { termsOfService } from "@/lib/legal/terms-of-service";

export default function TermsScreen() {
  return <LegalPage document={termsOfService} path="/terms" />;
}
