import { Loader2 } from "lucide-react";
import { PrintLayout, PrintTable } from "@/components/layout/print-layout";
import { useApiQuery } from "@/lib/api";
import { longDate, todayIso } from "@/lib/calendar";
import type { DailyPrep } from "@/pages/shared/reports";

/** Daily preparation sheet for the services team (seating, equipment, hospitality per booking). */
export default function PrintDaily() {
  const date = new URLSearchParams(window.location.search).get("date") || todayIso();
  const { data, isLoading } = useApiQuery<DailyPrep>(`/reports/daily-prep?date=${date}`);
  return (
    <PrintLayout title="قائمة تجهيز القاعات اليومية" subtitle={longDate(date)} ready={!!data} orientation="landscape">
      {isLoading || !data ? (
        <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : !data.items.length ? (
        <p className="text-center py-10">لا توجد حجوزات معتمدة في هذا اليوم</p>
      ) : (
        <PrintTable
          head={["#", "الوقت", "القاعة", "الجهة / النشاط", "الحضور", "ترتيب الجلوس", "التجهيزات", "الضيافة", "المنسق", "✓"]}
          rows={data.items.map((it, i) => [
            i + 1,
            <span dir="ltr" className="font-bold whitespace-nowrap">{it.startTime}–{it.endTime}</span>,
            <b>{it.hall}</b>,
            <>{it.department}<br /><span className="text-slate-500">{it.activityType}</span></>,
            it.attendees ?? "—",
            it.seatingLayout ?? "—",
            it.requestedItems.join("، ") || "—",
            [it.catering && `ضيافة: ${it.catering}`, it.meals && `وجبات: ${it.meals}`].filter(Boolean).join(" / ") || "—",
            it.coordinatorName ? <>{it.coordinatorName}<br /><span dir="ltr">{it.coordinatorPhone}</span></> : "—",
            <span className="inline-block w-5 h-5 border border-slate-500" />,
          ])}
        />
      )}
    </PrintLayout>
  );
}
