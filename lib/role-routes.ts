import type { Href } from "expo-router";

import type { Role } from "@/types/scheduling";

export const roleHomeRoutes: Record<Role, Href> = {
  patient: "/",
  doctor: "/agenda",
  admin: "/roster",
};
