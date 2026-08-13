"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveProjectAction, deleteProjectAction } from "@/actions/master";
import { Field, inputCls, Button, Spinner } from "@/components/ui";
import { FormSubmitButton } from "@/components/FormSubmitButton";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import type { Project } from "@/lib/types";

interface Opt { id: number; name: string }

export function ProjectManager({
  project,
  companies,
  customers,
}: {
  project?: Project;
  companies: Opt[];
  customers: Opt[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const editing = !!project;
  const d10 = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : "");

  const remove = () => {
    if (!project) return;
    if (!confirm(`Xóa dự án "${project.project_name}" (${project.project_code})?`)) return;
    start(async () => {
      const res = await deleteProjectAction(project.id);
      if (!res.ok) { toast(res.error ?? "Không xóa được.", "error"); return; }
      setOpen(false);
      if (res.deactivated) toast("Dự án đã phát sinh chứng từ nên được chuyển sang 'Ngưng' thay vì xóa.", "info");
      router.refresh();
    });
  };

  return (
    <>
      {editing ? (
        <button onClick={() => setOpen(true)} className="text-sm text-brand-600 hover:underline">Sửa</button>
      ) : (
        <Button onClick={() => setOpen(true)}>+ Thêm dự án</Button>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "Sửa dự án" : "Thêm dự án / công trình"}>
        <form action={async (fd) => { await saveProjectAction(fd); setOpen(false); router.refresh(); }} className="space-y-3">
          {editing && <input type="hidden" name="id" value={project.id} />}
          <div className="grid grid-cols-2 gap-3">
            {!editing && (
              <Field label="Mã dự án / công trình" required>
                <input name="project_code" required className={inputCls} placeholder="VD: CT-2026-001" />
              </Field>
            )}
            <Field label="Tên dự án" required>
              <input name="project_name" required defaultValue={project?.project_name} className={inputCls} />
            </Field>
            <Field label="Công ty (pháp nhân)">
              <select name="company_id" defaultValue={project?.company_id ?? ""} className={inputCls}>
                <option value="">— Không gán —</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Khách hàng">
              <select name="customer_id" defaultValue={project?.customer_id ?? ""} className={inputCls}>
                <option value="">— Không gán —</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Ngân sách (₫) — 0 = không kiểm soát">
              <input name="budget" type="number" step="any" min={0} defaultValue={project?.budget ?? 0} className={inputCls} />
            </Field>
            <Field label="Người phụ trách">
              <input name="manager_name" defaultValue={project?.manager_name ?? ""} className={inputCls} />
            </Field>
            <Field label="Địa điểm">
              <input name="location" defaultValue={project?.location ?? ""} className={inputCls} />
            </Field>
            <Field label="Ngày bắt đầu">
              <input name="start_date" type="date" defaultValue={d10(project?.start_date)} className={inputCls} />
            </Field>
            <Field label="Ngày kết thúc">
              <input name="end_date" type="date" defaultValue={d10(project?.end_date)} className={inputCls} />
            </Field>
            {editing && (
              <Field label="Trạng thái">
                <select name="status" defaultValue={project?.status ?? "Active"} className={inputCls}>
                  <option value="Active">Đang chạy</option>
                  <option value="Closed">Đã đóng</option>
                  <option value="Inactive">Ngưng</option>
                </select>
              </Field>
            )}
          </div>
          <Field label="Ghi chú">
            <input name="note" defaultValue={project?.note ?? ""} className={inputCls} />
          </Field>
          <div className="flex items-center gap-2 pt-2">
            {editing && (
              <button type="button" onClick={remove} disabled={pending} className="mr-auto inline-flex items-center gap-1.5 text-sm font-semibold text-rose-500 hover:underline disabled:opacity-40">
                {pending && <Spinner className="h-3.5 w-3.5" />}
                Xóa
              </button>
            )}
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Hủy</Button>
            <FormSubmitButton>Lưu</FormSubmitButton>
          </div>
        </form>
      </Modal>
    </>
  );
}
