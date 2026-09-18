import type { PropsWithChildren } from "react";

export interface SheetProps extends PropsWithChildren {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  accessibilityLabel?: string;
}
