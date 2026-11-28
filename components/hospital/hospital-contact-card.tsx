import type { ComponentType } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { Clock, Globe, Mail, MapPin, Phone, Siren } from "lucide-react-native";

import { Card } from "@/components/ui/card";
import {
  isMissingContact,
  mapsUrl,
  telUrl,
  type HospitalInfo,
} from "@/lib/hospital-info";
import { colors } from "@/lib/theme-colors";

type IconType = ComponentType<{ color?: string; size?: number }>;

interface RowProps {
  Icon: IconType;
  label: string;
  value: string;
  /** Opens this URL when tapped (tel:, mailto:, https:). */
  href?: string | null;
  tone?: "default" | "danger";
}

function ContactRow({ Icon, label, value, href, tone = "default" }: RowProps) {
  const color = tone === "danger" ? colors.danger : href ? colors.primary : colors["ink-muted"];
  const content = (
    <View className="min-h-12 flex-row items-center gap-3 py-1">
      <Icon color={color} size={20} />
      <View className="min-w-0 flex-1">
        <Text className={`text-xs font-semibold uppercase ${tone === "danger" ? "text-danger" : "text-ink-muted"}`}>
          {label}
        </Text>
        <Text
          className={`text-base ${href ? "font-medium text-primary" : "text-ink"}`}
          selectable
        >
          {value}
        </Text>
      </View>
    </View>
  );
  if (!href) {
    return content;
  }
  return (
    <Pressable
      accessibilityHint={`Opens ${label.toLowerCase()}`}
      accessibilityLabel={`${label}: ${value}`}
      accessibilityRole="link"
      className="rounded-xl web:hover:bg-surface-muted active:opacity-70"
      onPress={() => void Linking.openURL(href).catch(() => undefined)}
    >
      {content}
    </Pressable>
  );
}

/** Ways to reach the hospital (admin-managed in Settings). */
export function HospitalContactCard({ info }: { info: HospitalInfo }) {
  return (
    <Card style={{ gap: 4 }}>
      <Text accessibilityRole="header" className="pb-1 text-base font-semibold text-ink">
        Contact
      </Text>
      {info.emergencyPhone ? (
        <ContactRow
          Icon={Siren}
          href={telUrl(info.emergencyPhone)}
          label="Emergency"
          tone="danger"
          value={info.emergencyPhone}
        />
      ) : null}
      {info.phone ? (
        <ContactRow Icon={Phone} href={telUrl(info.phone)} label="Phone" value={info.phone} />
      ) : null}
      {info.email ? (
        <ContactRow Icon={Mail} href={`mailto:${info.email}`} label="Email" value={info.email} />
      ) : null}
      {info.address ? (
        <ContactRow Icon={MapPin} href={mapsUrl(info.address)} label="Address" value={info.address} />
      ) : null}
      {info.openingHours ? (
        <ContactRow Icon={Clock} label="Opening hours" value={info.openingHours} />
      ) : null}
      {info.website ? (
        <ContactRow Icon={Globe} href={info.website} label="Website" value={info.website.replace(/^https:\/\//, "")} />
      ) : null}
      {isMissingContact(info) ? (
        <Text className="text-sm text-ink-muted">
          Contact details will appear here once the hospital adds them. Ask at reception
          in the meantime.
        </Text>
      ) : null}
    </Card>
  );
}
