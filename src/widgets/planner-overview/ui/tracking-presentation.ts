import { CheckCircle2, Clock3, Hash, type LucideIcon, SlidersHorizontal } from "lucide-react";

import type { TrackingType } from "../model/plan-model";

export const trackingIconMap = {
  check: CheckCircle2,
  quantity: Hash,
  scale: SlidersHorizontal,
  time: Clock3,
} satisfies Record<TrackingType, LucideIcon>;
