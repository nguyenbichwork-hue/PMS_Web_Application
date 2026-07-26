"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { lockMonitorAction } from "@/actions/monitor";
import { Button } from "@/components/ui";

/** Khóa lại khu vực giám sát (xóa cookie PIN) — bấm khi rời máy. */
export function LockButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() => start(async () => { await lockMonitorAction(); router.refresh(); })}
    >
      🔒 Khóa lại
    </Button>
  );
}
