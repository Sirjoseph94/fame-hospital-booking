import { Link, router, Stack } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { PageScrollView } from "@/components/ui/page-scroll-view";
import type { LegalBlock, LegalDocument } from "@/lib/legal/types";

const otherDocument = {
  "/privacy": { href: "/terms", label: "Terms of Service" },
  "/terms": { href: "/privacy", label: "Privacy Policy" },
} as const;

interface LegalPageProps {
  document: LegalDocument;
  path: keyof typeof otherDocument;
}

/** Back if there is history (in-app navigation), else home (deep link / reload). */
export function goBack() {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/");
  }
}

function Block({ block }: { block: LegalBlock }) {
  if (typeof block === "string") {
    return <Text className="text-base leading-7 text-ink">{block}</Text>;
  }

  return (
    <View className="gap-2">
      {block.list.map((item) => (
        <View key={item} className="flex-row gap-3 pl-1">
          <Text aria-hidden className="text-base leading-7 text-ink-muted">
            •
          </Text>
          <Text className="flex-1 text-base leading-7 text-ink">{item}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Public, read-only page for a legal document. Lives outside the role-guarded
 * route groups so it works signed out, and app-store reviewers can open it.
 */
export function LegalPage({ document, path }: LegalPageProps) {
  const other = otherDocument[path];

  return (
    <>
      <Stack.Screen options={{ title: `${document.title} · FAME Hospital Booking` }} />
      <PageScrollView
        className="flex-1 bg-surface-muted"
        contentContainerClassName="items-center px-4 py-10"
        contentInsetAdjustmentBehavior="automatic"
      >
        <View className="w-full max-w-2xl gap-8">
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="link"
            className="min-h-12 self-start justify-center web:hover:opacity-80"
            onPress={goBack}
          >
            <Text className="text-base font-semibold text-primary">← Back</Text>
          </Pressable>

          <View className="gap-2">
            <Text accessibilityRole="header" className="text-3xl font-bold text-ink">
              {document.title}
            </Text>
            <Text className="text-sm text-ink-muted">
              Last updated {document.lastUpdated}
            </Text>
          </View>

          <Text className="text-base leading-7 text-ink">{document.intro}</Text>

          {document.sections.map((section, index) => (
            <View key={section.heading} className="gap-3">
              <Text accessibilityRole="header" className="text-xl font-semibold text-ink">
                {index + 1}. {section.heading}
              </Text>
              {section.blocks.map((block, blockIndex) => (
                <Block key={blockIndex} block={block} />
              ))}
            </View>
          ))}

          <View className="border-t border-slate-200 pt-6">
            <Link
              accessibilityRole="link"
              className="min-h-12 py-3 text-base font-semibold text-primary web:hover:opacity-80"
              href={other.href}
            >
              Read our {other.label}
            </Link>
          </View>
        </View>
      </PageScrollView>
    </>
  );
}
