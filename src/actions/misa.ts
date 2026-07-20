"use server";
import { revalidatePath } from "next/cache";
import { query } from "@/lib/db";
import { requireUser, can } from "@/lib/auth";
import { syncMisaMasterData, type SyncResult } from "@/lib/misa/sync";

// Đồng bộ master data từ MISA theo yêu cầu (nút trong Cấu hình). Chỉ Admin.
export async function syncMisaAction(): Promise<SyncResult> {
  const user = await requireUser();
  if (!can(user.role, "settings.manage")) throw new Error("FORBIDDEN");

  const res = await syncMisaMasterData((sql, params = []) => query(sql, params));

  revalidatePath("/suppliers");
  revalidatePath("/products");
  revalidatePath("/settings");
  return res;
}
