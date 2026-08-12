"use client";
import { createContext, useContext, useState } from "react";

// Theo dõi form PRQEditor có thay đổi CHƯA LƯU hay không, để nút "Gửi duyệt"
// (component PRQActions tách riêng) nhắc người dùng bấm Lưu trước.
const DirtyCtx = createContext<{ dirty: boolean; setDirty: (v: boolean) => void }>({
  dirty: false,
  setDirty: () => {},
});

export function usePrqDirty() { return useContext(DirtyCtx); }

export function PrqDirtyProvider({ children }: { children: React.ReactNode }) {
  const [dirty, setDirty] = useState(false);
  return <DirtyCtx.Provider value={{ dirty, setDirty }}>{children}</DirtyCtx.Provider>;
}
