import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getListBookingsQueryKey } from "@workspace/api-client-react";
import { Archive, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { api, errorMessage } from "@/lib/api";

export const ARCHIVABLE = ["completed", "cancelled", "emergency_cancelled", "rejected"];
export const isArchivable = (b: { status: string }) => ARCHIVABLE.includes(b.status);

/** Archive bookings and refresh every list that shows them. */
export function useArchive(archivePath: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const run = async (body: { ids: number[] } | { all: true }) => {
    setBusy(true);
    try {
      const r = await api<{ archived: number }>("POST", "/bookings/archive", body);
      toast({
        title: r.archived === 1 ? "نُقل الحجز إلى الأرشيف" : r.archived ? `نُقل ${r.archived} حجز إلى الأرشيف` : "لا توجد حجوزات جاهزة للأرشفة",
        description: r.archived ? "تجدها في «الأرشيف» ويمكن إعادتها في أي وقت" : undefined,
        action: r.archived ? (<Button asChild size="sm" variant="outline"><Link href={archivePath}>فتح الأرشيف</Link></Button>) as never : undefined,
      });
      qc.invalidateQueries({ queryKey: getListBookingsQueryKey() });
      qc.invalidateQueries({ queryKey: ["v2"] });
    } catch (e) {
      toast({ variant: "destructive", title: errorMessage(e, "تعذّرت الأرشفة") });
    } finally {
      setBusy(false);
    }
  };
  return { busy, archiveIds: (ids: number[]) => run({ ids }), archiveAll: () => run({ all: true }) };
}

export function ArchiveAllButton({ count, onClick, busy }: { count: number; onClick: () => void; busy: boolean }) {
  if (count < 1) return null;
  return (
    <Button size="sm" variant="outline" className="h-8" onClick={onClick} disabled={busy}>
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
      أرشفة المنتهية والملغاة ({count})
    </Button>
  );
}
