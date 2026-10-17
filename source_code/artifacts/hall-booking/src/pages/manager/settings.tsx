import { useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/layout/page-header";
import { useListHolidays, useCreateHoliday, useDeleteHoliday, getListHolidaysQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { CalendarOff, Loader2, Plus, Trash2 } from "lucide-react";
import { DateLeaf, EmptyState, SectionTitle, daysFromToday, relativeDay } from "@/components/booking/ticket";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { todayIso } from "@/lib/calendar";

export default function ManagerHolidays() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: holidays, isLoading } = useListHolidays();
  const createHoliday = useCreateHoliday();
  const deleteHoliday = useDeleteHoliday();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [toDelete, setToDelete] = useState<{ id: number; name: string; date: string } | null>(null);
  const today = todayIso();

  const { upcoming, past } = useMemo(() => {
    const all = [...(holidays ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    return { upcoming: all.filter((h) => h.date >= today), past: all.filter((h) => h.date < today).reverse() };
  }, [holidays, today]);

  const duplicate = !!date && (holidays ?? []).some((h) => h.date.slice(0, 10) === date);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !date || duplicate) return;
    try {
      await createHoliday.mutateAsync({ data: { name: name.trim(), nameAr: name.trim(), date } });
      toast({ title: "أُضيفت العطلة", description: `${name.trim()} — ${formatDate(date)}` });
      setName("");
      setDate("");
      qc.invalidateQueries({ queryKey: getListHolidaysQueryKey() });
    } catch (err) {
      toast({ variant: "destructive", title: "تعذّرت إضافة العطلة", description: errorMessage(err, "") });
    }
  };

  const remove = async () => {
    if (!toDelete) return;
    try {
      await deleteHoliday.mutateAsync({ id: toDelete.id });
      toast({ title: "حُذفت العطلة" });
      qc.invalidateQueries({ queryKey: getListHolidaysQueryKey() });
    } catch (err) {
      toast({ variant: "destructive", title: "تعذّر حذف العطلة", description: errorMessage(err, "") });
    } finally {
      setToDelete(null);
    }
  };

  const row = (h: { id: number; name: string; nameAr?: string | null; date: string }, isPast: boolean) => {
    const label = h.nameAr || h.name;
    const d = daysFromToday(h.date.slice(0, 10));
    return (
      <li key={h.id} className="flex items-stretch rounded-2xl border bg-card overflow-hidden">
        <DateLeaf date={h.date.slice(0, 10)} tone="violet" muted={isPast} />
        <div className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="font-bold truncate">{label}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{formatDate(h.date)}</p>
          </div>
          {!isPast && (
            <span className={d <= 7 ? "text-xs font-semibold rounded-full px-2.5 py-1 bg-violet-500/10 text-violet-700 dark:text-violet-300 whitespace-nowrap" : "text-xs text-muted-foreground whitespace-nowrap"}>
              {relativeDay(h.date.slice(0, 10))}
            </span>
          )}
          <Button size="icon" variant="ghost" className="h-9 w-9 text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 shrink-0" aria-label={`حذف ${label}`} onClick={() => setToDelete({ id: h.id, name: label, date: h.date })}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </li>
    );
  };

  return (
    <MainLayout>
      <div className="space-y-5 max-w-4xl">
        <PageHeader icon={CalendarOff} title="العطل الرسمية" description="أيام لا يمكن الحجز فيها، وتظهر بالبنفسجي في تقويم الحجز" />

        <form onSubmit={add} className="rounded-2xl border bg-card p-4 sm:p-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="h-name">اسم العطلة</Label>
            <Input id="h-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="مثل: عيد الأضحى" maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="h-date">التاريخ</Label>
            <Input id="h-date" type="date" value={date} min={today} onChange={(e) => setDate(e.target.value)} dir="ltr" className="text-right" />
          </div>
          <Button type="submit" disabled={!name.trim() || !date || duplicate || createHoliday.isPending} className="h-10">
            {createHoliday.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            إضافة العطلة
          </Button>
          {duplicate && <p className="text-xs text-rose-600 sm:col-span-3">هذا التاريخ مضاف مسبقاً عطلةً رسمية.</p>}
        </form>

        {isLoading ? (
          <div className="space-y-2.5">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
        ) : !holidays?.length ? (
          <EmptyState icon={CalendarOff} title="لا توجد عطل رسمية" hint="أضف العطل الرسمية القادمة ليمتنع الحجز فيها تلقائياً." />
        ) : (
          <div className="space-y-6">
            <section className="space-y-2.5">
              <SectionTitle count={upcoming.length}>القادمة</SectionTitle>
              {upcoming.length ? <ul className="grid gap-2.5 md:grid-cols-2">{upcoming.map((h) => row(h, false))}</ul> : <p className="text-sm text-muted-foreground">لا توجد عطل قادمة.</p>}
            </section>
            {past.length > 0 && (
              <section className="space-y-2.5">
                <SectionTitle count={past.length}>السابقة</SectionTitle>
                <ul className="grid gap-2.5 md:grid-cols-2">{past.map((h) => row(h, true))}</ul>
              </section>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف «{toDelete?.name}»؟</AlertDialogTitle>
            <AlertDialogDescription>سيصبح يوم {toDelete ? formatDate(toDelete.date) : ""} متاحاً للحجز من جديد.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" onClick={remove}>حذف العطلة</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
