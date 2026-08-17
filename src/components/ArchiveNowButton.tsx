"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";
import { useToast } from "@/components/Toast";
import { archiveDocumentNowAction } from "@/actions/archive";

/** Nút "Lưu trữ lên OneDrive" — đẩy đính kèm chứng từ đã hoàn tất theo yêu cầu.
 *  Hiện trên trang chi tiết PRQ/Invoice khi đã Paid. Toast rõ kết quả/lỗi. */
export function ArchiveNowButton({
  documentType,
  documentId,
}: {
  documentType: "PR" | "PO" | "Invoice" | "PRQ";
  documentId: number;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();

  return (
    <Button
      variant="secondary"
      className="w-full justify-center"
      loading={pending}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await archiveDocumentNowAction(documentType, documentId);
          if (res.ok) {
            toast(res.message, "success");
            router.refresh();
          } else {
            toast(res.error, "error");
          }
        })
      }
    >
      ☁ Lưu trữ lên OneDrive
    </Button>
  );
}
