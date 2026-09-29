import type { ClaimStatus } from "@/domain/membership/membership";
import { Badge } from "@/ui/badge";

const VARIANT = {
  pending: "outline",
  approved: "default",
  rejected: "destructive",
} as const;

const LABEL: Record<ClaimStatus, string> = {
  pending: "Pending review",
  approved: "Approved",
  rejected: "Not approved",
};

export function ClaimStatusBadge({ status }: { status: ClaimStatus }) {
  return <Badge variant={VARIANT[status]}>{LABEL[status]}</Badge>;
}
