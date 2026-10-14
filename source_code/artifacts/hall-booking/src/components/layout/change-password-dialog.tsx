import { useState } from "react";
import { useChangePassword } from "@workspace/api-client-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Eye, EyeOff, KeyRound, Loader2, ShieldAlert } from "lucide-react";

export function ChangePasswordDialog({ open, onOpenChange, forced = false }: { open: boolean; onOpenChange: (v: boolean) => void; forced?: boolean }) {
  const change = useChangePassword();
  const { toast } = useToast();
  const { updateUser, logout } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setCurrent(""); setNext(""); setConfirm(""); setError(null); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next !== confirm) return setError("كلمتا المرور غير متطابقتين");
    if (next.length < 6) return setError("كلمة المرور يجب أن تتكون من 6 رموز على الأقل");
    try {
      await change.mutateAsync({ data: { currentPassword: current, newPassword: next } });
      updateUser({ mustChangePassword: false });
      toast({ title: "تم تغيير كلمة المرور بنجاح", description: "تم تسجيل الخروج من الأجهزة الأخرى" });
      reset();
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.data?.error ?? "تعذر تغيير كلمة المرور");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!forced) { onOpenChange(v); if (!v) reset(); } }}>
      <DialogContent
        className="sm:max-w-md"
        dir="rtl"
        onInteractOutside={(e) => forced && e.preventDefault()}
        onEscapeKeyDown={(e) => forced && e.preventDefault()}
        hideClose={forced}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {forced ? <ShieldAlert className="w-5 h-5 text-amber-600" /> : <KeyRound className="w-5 h-5 text-primary" />}
            {forced ? "يجب تغيير كلمة المرور" : "تغيير كلمة المرور"}
          </DialogTitle>
          <DialogDescription>
            {forced
              ? "لأسباب أمنية يجب اختيار كلمة مرور جديدة قوية قبل متابعة استخدام النظام."
              : "استخدم 6 رموز على الأقل (أرقام أو حروف أو رموز حسب اختيارك)."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cp-current">كلمة المرور الحالية</Label>
            <Input id="cp-current" type={show ? "text" : "password"} value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" dir="ltr" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp-new">كلمة المرور الجديدة</Label>
            <div className="relative">
              <Input id="cp-new" type={show ? "text" : "password"} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" dir="ltr" className="pl-10" required />
              <button type="button" tabIndex={-1} onClick={() => setShow((s) => !s)} className="absolute left-3 top-2.5 text-muted-foreground hover:text-foreground">
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp-confirm">تأكيد كلمة المرور الجديدة</Label>
            <Input id="cp-confirm" type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" dir="ltr" required />
          </div>
          {error && <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="submit" disabled={change.isPending}>
              {change.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              حفظ كلمة المرور
            </Button>
            {forced ? (
              <Button type="button" variant="ghost" onClick={logout}>تسجيل الخروج</Button>
            ) : (
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
