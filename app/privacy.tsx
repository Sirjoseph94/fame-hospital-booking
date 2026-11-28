import { LegalPage } from "@/components/legal/legal-page";
import { buildPrivacyPolicy } from "@/lib/legal/privacy-policy";
import { DEFAULT_HOSPITAL_INFO } from "@/lib/hospital-info";
import { useHospitalInfo } from "@/lib/queries/hospital-info";

export default function PrivacyScreen() {
  const { data: info } = useHospitalInfo();
  return <LegalPage document={buildPrivacyPolicy(info ?? DEFAULT_HOSPITAL_INFO)} path="/privacy" />;
}
