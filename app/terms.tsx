import { LegalPage } from "@/components/legal/legal-page";
import { buildTermsOfService } from "@/lib/legal/terms-of-service";
import { DEFAULT_HOSPITAL_INFO } from "@/lib/hospital-info";
import { useHospitalInfo } from "@/lib/queries/hospital-info";

export default function TermsScreen() {
  const { data: info } = useHospitalInfo();
  return <LegalPage document={buildTermsOfService(info ?? DEFAULT_HOSPITAL_INFO)} path="/terms" />;
}
