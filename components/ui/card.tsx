import type { PropsWithChildren } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { View } from "react-native";

import { selectPlatform } from "@/lib/platform";

interface CardProps extends PropsWithChildren {
  style?: StyleProp<ViewStyle>;
}

const cardShadow = selectPlatform<ViewStyle>({
  ios: {
    shadowColor: "black",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
  },
  android: {
    elevation: 2,
  },
  web: {
    boxShadow: "0px 4px 20px rgba(0,0,0,0.04)",
  },
  default: {},
});

export function Card({ children, style }: CardProps) {
  return (
    <View
      className="rounded-2xl bg-surface p-4"
      style={[cardShadow, style]}
    >
      {children}
    </View>
  );
}
