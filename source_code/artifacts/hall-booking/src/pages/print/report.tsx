import { Loader2 } from "lucide-react";
import { PrintLayout, PrintTable } from "@/components/layout/print-layout";
import { useApiQuery } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { Heatmap, type OccupancyReport } from "@/pages/shared/reports";

/** Printable / PDF version of the occupancy report. */
export default function PrintReport() {
  const q = new URLSearchParams(window.location.search);
  const from = q.get("from") ?? "";
  const to = q.get("to") ?? "";
  const { data: r, isLoading } = useApiQuery<OccupancyReport>(`/reports/occupancy?from=${from}&to=${to}`);
  return (
    <PrintLayout title="تقرير إشغال القاعات" subtitle={`للفترة من ${formatDate(from)} إلى ${formatDate(to)}`} ready={!!r}>
      {isLoading || !r ? (
        <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : (
        <div className="space-y-6 text-[13px]">
          <div className="grid grid-cols-4 gap-2">
            {[
              ["نسبة الإشغال", `${r.totals.utilization}%`],
              ["الساعات المحجوزة", `${r.totals.bookedHours} / ${r.totals.availableHours}`],
              ["الحجوزات المنفذة", `${r.totals.approved} من ${r.totals.bookings}`],
              ["الملغاة والمرفوضة", r.totals.cancelled + r.totals.rejected],
              ["أيام العمل", r.workingDays],
              ["متوسط زمن الاستجابة", r.totals.avgResponseHours != null ? `${r.totals.avgResponseHours} ساعة` : "—"],
              ["أعمال الصيانة", `${r.totals.maintenanceOpened} (${r.totals.maintenanceResolved} منجزة)`],
              ["الجهات المستفيدة", r.departments.length],
            ].map(([k, v]) => (
              <div key={String(k)} className="border border-slate-300 rounded p-2 text-center break-inside-avoid">
                <p className="text-[11px] text-slate-500">{k}</p>
                <p className="font-bold text-base tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          {r.underused.length > 0 && <p className="border border-amber-400 rounded p-2">القاعات قليلة الاستخدام (أقل من 20%): <b>{r.underused.join("، ")}</b></p>}
          <section className="space-y-2">
            <h2 className="font-bold">أولاً: إشغال القاعات</h2>
            <PrintTable
              head={["القاعة", "السعة", "الطلبات", "المنفذة", "الملغاة", "الساعات المحجوزة", "الساعات المتاحة", "الإشغال", "الصيانة"]}
              rows={r.halls.map((h) => [h.name, h.capacity, h.bookings, h.approved, h.cancelled, h.bookedHours, h.availableHours, `${h.utilization}%`, h.maintenance])}
            />
          </section>
          <section className="space-y-2 break-inside-avoid">
            <h2 className="font-bold">ثانياً: أوقات الذروة</h2>
            <Heatmap heatmap={r.heatmap} />
          </section>
          <section className="space-y-2">
            <h2 className="font-bold">ثالثاً: الجهات الأكثر حجزاً</h2>
            <PrintTable head={["الجهة", "عدد الطلبات", "الساعات", "الملغاة"]} rows={r.departments.slice(0, 15).map((d) => [d.name, d.bookings, d.hours, d.cancelled])} />
          </section>
          <section className="space-y-2 break-inside-avoid">
            <h2 className="font-bold">رابعاً: الحجوزات حسب نوع النشاط</h2>
            <PrintTable head={["نوع النشاط", "العدد"]} rows={r.activities.map((a) => [a.type, a.count])} />
          </section>
        </div>
      )}
    </PrintLayout>
  );
}
