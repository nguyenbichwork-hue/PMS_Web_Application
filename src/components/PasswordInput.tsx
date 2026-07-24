"use client";
import { useState } from "react";

// Ô nhập MẬT KHẨU chặn bộ gõ tiếng Việt (Unikey/Telex/VNI): tự LOẠI mọi ký tự
// ngoài ASCII in được (0x20–0x7E) ngay khi gõ + khi kết thúc composition, để mật
// khẩu không lẫn dấu (â, á, đ…). Uncontrolled (form đọc theo `name`) → dùng được
// ở mọi form mà không cần state ngoài.
const NON_ASCII = /[^\x20-\x7E]/g;

export function PasswordInput({
  name = "password",
  className,
  placeholder = "••••••••",
  required = false,
  autoComplete = "new-password",
  type = "password",
  hint = true,
  hintClass = "",
}: {
  name?: string;
  className?: string;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  type?: "password" | "text";
  hint?: boolean;
  hintClass?: string;
}) {
  const [warn, setWarn] = useState(false);

  const clean = (el: HTMLInputElement) => {
    const c = el.value.replace(NON_ASCII, "");
    if (c !== el.value) {
      el.value = c;
      setWarn(true);
    }
  };

  return (
    <div>
      <input
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        spellCheck={false}
        lang="en"
        placeholder={placeholder}
        className={className}
        onInput={(e) => clean(e.currentTarget)}
        onCompositionEnd={(e) => clean(e.currentTarget)}
      />
      {hint && (
        <p className={`mt-1 text-xs ${warn ? "text-amber-500" : "text-slate-400/80"} ${hintClass}`}>
          {warn
            ? "⚠ Đã loại ký tự có dấu — hãy TẮT Unikey/bộ gõ tiếng Việt khi nhập mật khẩu."
            : "Chỉ chữ/số không dấu — nên tắt Unikey khi nhập."}
        </p>
      )}
    </div>
  );
}
