"use client";
import { createContext, useCallback, useContext, useState } from "react";
import { Modal } from "./Modal";
import { Button } from "./ui";

// Hộp thoại Xác nhận / Nhập liệu dùng chung — THAY cho window.confirm()/window.prompt()
// (vốn xấu, không khớp UI, bị chặn ở một số môi trường). API trả Promise để gọi
// bằng await trong event handler: const ok = await confirm("Xóa?"); if (!ok) return;

type ConfirmOpts = { title?: string; message: string; confirmText?: string; cancelText?: string; danger?: boolean };
type PromptOpts = { title?: string; message?: string; placeholder?: string; defaultValue?: string; confirmText?: string };

interface DialogApi {
  // confirm: trả true nếu người dùng đồng ý, false nếu hủy/đóng.
  confirm: (opts: ConfirmOpts | string) => Promise<boolean>;
  // prompt: trả chuỗi (có thể rỗng) nếu đồng ý, null nếu hủy/đóng — GIỐNG window.prompt.
  prompt: (opts: PromptOpts | string) => Promise<string | null>;
}

// Mặc định (ngoài Provider) lùi về API native để không vỡ nếu quên bọc Provider.
const Ctx = createContext<DialogApi>({
  confirm: (o) => Promise.resolve(window.confirm(typeof o === "string" ? o : o.message)),
  prompt: (o) =>
    Promise.resolve(
      window.prompt(
        typeof o === "string" ? o : o.message ?? "",
        typeof o === "string" ? "" : o.defaultValue ?? ""
      )
    ),
});

export function useConfirm() { return useContext(Ctx).confirm; }
export function usePrompt() { return useContext(Ctx).prompt; }

type State =
  | { kind: "confirm"; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: "prompt"; opts: PromptOpts; resolve: (v: string | null) => void }
  | null;

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>(null);
  const [value, setValue] = useState("");

  const confirm = useCallback((o: ConfirmOpts | string) => {
    const opts = typeof o === "string" ? { message: o } : o;
    return new Promise<boolean>((resolve) => setState({ kind: "confirm", opts, resolve }));
  }, []);

  const prompt = useCallback((o: PromptOpts | string) => {
    const opts = typeof o === "string" ? { message: o } : o;
    setValue(opts.defaultValue ?? "");
    return new Promise<string | null>((resolve) => setState({ kind: "prompt", opts, resolve }));
  }, []);

  // Đóng mà KHÔNG đồng ý → confirm=false / prompt=null.
  const cancel = useCallback(() => {
    setState((s) => {
      if (s) s.kind === "confirm" ? s.resolve(false) : s.resolve(null);
      return null;
    });
  }, []);

  const accept = useCallback(() => {
    setState((s) => {
      if (s) s.kind === "confirm" ? s.resolve(true) : s.resolve(value);
      return null;
    });
  }, [value]);

  return (
    <Ctx.Provider value={{ confirm, prompt }}>
      {children}
      <Modal
        open={!!state}
        onClose={cancel}
        title={state?.opts.title ?? (state?.kind === "prompt" ? "Nhập thông tin" : "Xác nhận")}
        footer={
          <>
            <Button variant="secondary" onClick={cancel}>
              {(state?.kind === "confirm" && state.opts.cancelText) || "Hủy"}
            </Button>
            <Button
              variant={state?.kind === "confirm" && state.opts.danger ? "danger" : "primary"}
              onClick={accept}
            >
              {state?.opts.confirmText || (state?.kind === "prompt" ? "Xác nhận" : "Đồng ý")}
            </Button>
          </>
        }
      >
        {state?.kind === "confirm" ? (
          <p className="whitespace-pre-line text-sm text-slate-700">{state.opts.message}</p>
        ) : state?.kind === "prompt" ? (
          <div className="space-y-2">
            {state.opts.message && <p className="text-sm text-slate-700">{state.opts.message}</p>}
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") accept(); }}
              placeholder={state.opts.placeholder}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30"
            />
          </div>
        ) : null}
      </Modal>
    </Ctx.Provider>
  );
}
