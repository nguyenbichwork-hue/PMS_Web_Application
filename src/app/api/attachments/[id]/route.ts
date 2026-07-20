import { getCurrentUser } from "@/lib/auth";
import { queryOne } from "@/lib/db";
import { readFile } from "@/lib/storage";

// Phục vụ tải file đính kèm (chỉ cho người đã đăng nhập).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const att = await queryOne<{ file_name: string; file_url: string }>(
    `SELECT file_name, file_url FROM attachments WHERE id = $1`,
    [Number(id)]
  );
  if (!att) return new Response("Not found", { status: 404 });

  try {
    const data = await readFile(att.file_url);
    const encoded = encodeURIComponent(att.file_name);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `inline; filename*=UTF-8''${encoded}`,
      },
    });
  } catch {
    return new Response("File missing", { status: 410 });
  }
}
