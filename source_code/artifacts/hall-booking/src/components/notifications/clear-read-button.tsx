import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListNotificationsQueryKey } from "@workspace/api-client-react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";

/** "Delete read notifications" with a confirmation; shown only when something has been read. */
export function ClearReadButton({ readCount, className }: { readCount: number; className?: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (readCount < 1) return null;
  const run = async () => {
    setBusy(true);
    try {
      const r = await api<{ deleted: number }>("POST", "/notifications/clear-read");
      toast({ title: `حُذف ${r.deleted} إشعار مقروء` });
      qc.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
      setOpen(false);
    } catch (e) {
      toast({ variant: "destructive", title: errorMessage(e, "تعذّر حذف الإشعارات") });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button variant="outline" className={cn("gap-2 text-rose-600 hover:text-rose-700", className)} onClick={() => setOpen(true)}>
        <Trash2 className="w-4 h-4" />حذف المقروءة ({readCount})
      </Button>
      <AlertDialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف {readCount} إشعار مقروء؟</AlertDialogTitle>
            <AlertDialogDescription>تبقى الإشعارات غير المقروءة كما هي. لا يمكن استرجاع ما يُحذف.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel disabled={busy}>إلغاء</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" disabled={busy} onClick={(e) => { e.preventDefault(); void run(); }}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}حذف المقروءة
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
