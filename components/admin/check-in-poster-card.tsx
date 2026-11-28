import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Printer, RefreshCw } from "lucide-react-native";

import { Card } from "@/components/ui/card";
import { QrCode, qrSvgMarkup } from "@/components/ui/qr-code";
import { checkInPosterHtml, checkInUrl, formatCheckInCode } from "@/lib/check-in";
import { confirmAsync, showAlert } from "@/lib/confirm";
import { printHtml } from "@/lib/print-html";
import { useHospitalInfo } from "@/lib/queries/hospital-info";
import { useCheckInCode, useRotateCheckInCode } from "@/lib/queries/hospital-settings";
import { colors } from "@/lib/theme-colors";

/** Admin: the QR poster patients scan at reception to check in. */
export function CheckInPosterCard() {
  const codeQuery = useCheckInCode();
  const rotate = useRotateCheckInCode();
  const { data: info } = useHospitalInfo();
  const [printing, setPrinting] = useState(false);
  const code = codeQuery.data?.code;

  const print = async () => {
    if (!code) return;
    setPrinting(true);
    try {
      await printHtml(
        checkInPosterHtml({
          hospitalName: info?.name ?? "FAME Hospital",
          code,
          qrSvg: qrSvgMarkup(checkInUrl(code), 320),
        }),
      );
    } catch (cause) {
      showAlert("Could not print", cause instanceof Error ? cause.message : "Try again.");
    } finally {
      setPrinting(false);
    }
  };

  const issueNewCode = async () => {
    const confirmed = await confirmAsync({
      title: "Issue a new check-in code?",
      message:
        "The current poster stops working straight away. Print the new poster and replace the old one at reception.",
      confirmText: "Issue new code",
      cancelText: "Keep current code",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await rotate.mutateAsync();
    } catch (cause) {
      showAlert("Could not issue a new code", cause instanceof Error ? cause.message : "Try again.");
    }
  };

  return (
    <Card style={{ gap: 12 }}>
      <View className="gap-1">
        <Text accessibilityRole="header" className="text-base font-semibold text-ink">
          Check-in poster
        </Text>
        <Text className="text-sm text-ink-muted">
          Put this at reception. Patients scan it in the app (or type the code) to join the
          queue for today&apos;s session. Issue a new code if it gets shared outside the hospital.
        </Text>
      </View>
      {codeQuery.isPending ? (
        <ActivityIndicator color={colors.primary} />
      ) : codeQuery.isError || !code ? (
        <Text className="text-sm text-danger">Could not load the check-in code. Pull to refresh.</Text>
      ) : (
        <View className="items-center gap-2">
          <View className="rounded-2xl border border-ink-muted bg-surface p-2">
            <QrCode
              accessibilityLabel={`Check-in QR code. Code ${code.split("").join(" ")}`}
              size={200}
              value={checkInUrl(code)}
            />
          </View>
          <Text className="text-3xl font-extrabold tracking-[6px] text-ink" selectable>
            {formatCheckInCode(code)}
          </Text>
          {codeQuery.data?.rotatedAt ? (
            <Text className="text-xs text-ink-muted">
              Issued {formatDistanceToNow(parseISO(codeQuery.data.rotatedAt), { addSuffix: true })}
            </Text>
          ) : null}
        </View>
      )}
      <View className="flex-row flex-wrap gap-2">
        <Pressable
          accessibilityLabel="Print check-in poster"
          accessibilityRole="button"
          accessibilityState={{ disabled: !code || printing, busy: printing }}
          className="min-h-12 flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-primary px-4 web:hover:opacity-90"
          disabled={!code || printing}
          onPress={() => void print()}
        >
          <Printer color={colors.surface} size={18} />
          <Text className="text-base font-semibold text-surface">{printing ? "Preparing…" : "Print poster"}</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Issue a new check-in code"
          accessibilityRole="button"
          accessibilityState={{ disabled: rotate.isPending, busy: rotate.isPending }}
          className="min-h-12 flex-1 flex-row items-center justify-center gap-2 rounded-xl border border-ink-muted px-4 web:hover:opacity-90"
          disabled={rotate.isPending}
          onPress={() => void issueNewCode()}
        >
          <RefreshCw color={colors.ink} size={18} />
          <Text className="text-base font-semibold text-ink">{rotate.isPending ? "Issuing…" : "New code"}</Text>
        </Pressable>
      </View>
    </Card>
  );
}
