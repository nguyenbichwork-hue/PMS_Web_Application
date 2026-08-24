"use client";
import { useEffect } from "react";

/** Trang đăng nhập LUÔN sáng, bất kể theme mặc định (app mặc định TỐI). Gỡ class
 *  `dark` khi ở login; khôi phục khi rời trang (điều hướng client). Sau khi đăng
 *  nhập thành công là redirect full-reload → script ở <head> tự áp lại theme user. */
export function ForceLightTheme() {
  useEffect(() => {
    const el = document.documentElement;
    const had = el.classList.contains("dark");
    el.classList.remove("dark");
    return () => { if (had) el.classList.add("dark"); };
  }, []);
  return null;
}
