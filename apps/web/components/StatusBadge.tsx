"use client";

import { Zap } from "lucide-react";
import { useStatus } from "@/lib/portal-context";
import type { StatusCode } from "@/lib/types";
import { Badge } from "./ui";

export function StatusBadge({ status }: { status: StatusCode }) {
  const s = useStatus()(status);
  return <Badge color={s.color}>{s.label}</Badge>;
}

export function ImmediateBadge() {
  return (
    <Badge color="#E07A2F">
      <Zap className="h-3 w-3" /> Immédiat
    </Badge>
  );
}
