"use client";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";

/**
 * Nút submit cho form dùng `action={serverAction}` — TỰ hiện spinner khi form đang
 * gửi (useFormStatus). Nhờ vậy mọi biểu mẫu có phản hồi "đã nhận lệnh" mà không cần
 * tự quản lý trạng thái pending.
 */
export function FormSubmitButton({
  children,
  pendingText,
  variant = "primary",
  className,
  disabled,
}: {
  children: React.ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger" | "ghost" | "success";
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} className={className} loading={pending} disabled={disabled}>
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}
