import { Platform } from "react-native";

import { Sheet as NativeSheet } from "@/components/ui/sheet.native";
import { Sheet as WebSheet } from "@/components/ui/sheet.web";

export type { SheetProps } from "@/components/ui/sheet.types";

export const Sheet = Platform.OS === "web" ? WebSheet : NativeSheet;
