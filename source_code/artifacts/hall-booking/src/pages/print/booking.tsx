import { useParams } from "wouter";
import { Loader2 } from "lucide-react";
import { PrintLayout } from "@/components/layout/print-layout";
import { usePublicSettings } from "@/components/layout/use-public-settings";
import { useApiQuery, type BookingSlip } from "@/lib/api";
import { longDate } from "@/lib/calendar";
import { BOOKING_STATUS } from "@/lib/labels";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "" || value === false) return null;
  return (
    <tr className="break-inside-avoid">
      <th className="w-40 border border-slate-300 bg-slate-50 px-3 py-2 text-start font-semibold text-[13px] align-top">{label}</th>
      <td className="border border-slate-300 px-3 py-2 text-[13px]">{value}</td>
    </tr>
  );
}

/** Official booking notice (A4): printed for the paper file or pinned to the hall door; QR verifies it online. */
export default function PrintBooking() {
  const { id } = useParams<{ id: string }>();
  const { data: s } = usePublicSettings();
  const { data: b, isLoading, error } = useApiQuery<BookingSlip>(`/bookings/${id}/slip?origin=${encodeURIComponent(window.location.origin)}`);
  const print = s?.options?.print;
  const approved = b && ["approved", "partially_approved", "completed"].includes(b.status);

  return (
    <PrintLayout title={`إشعار حجز قاعة — رقم ${id}`} subtitle={b ? `رمز التحقق: ${b.publicCode}` : undefined} ready={!!b}>
      {isLoading ? (
        <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div>
      ) : error || !b ? (
        <p className="text-center text-red-600 py-10">تعذّر تحميل بيانات الحجز</p>
      ) : (
        <div className="space-y-5">
          {!approved && (
            <div className="border-2 border-amber-500 text-amber-800 rounded-lg p-3 text-center font-bold">
              حالة الطلب: {BOOKING_STATUS[b.status]?.label ?? b.status} — هذا الإشعار غير نافذ لحين الموافقة
            </div>
          )}
          <div className="flex gap-5 items-start">
            <table className="flex-1 border-collapse">
              <tbody>
                <Row label="القاعة" value={<><b>{b.hall?.name}</b>{b.hall?.referenceCode ? <span className="text-slate-500"> ({b.hall.referenceCode})</span> : null}</>} />
                <Row label="الموقع" value={[b.hall?.location, b.hall?.building, b.hall?.floor && `الطابق ${b.hall.floor}`].filter(Boolean).join(" — ")} />
                <Row label="الجهة الطالبة" value={<b>{b.department}</b>} />
                <Row label="نوع النشاط" value={b.activityType} />
                <Row label="عنوان النشاط" value={b.reason} />
                <Row label="التاريخ" value={b.endDate !== b.startDate ? `من ${longDate(b.startDate)} إلى ${longDate(b.endDate)}` : longDate(b.startDate)} />
                <Row label="الوقت" value={<span dir="ltr" className="font-bold">{b.startTime} – {b.endTime}</span>} />
                <Row label="التكرار" value={b.isRecurring ? `أسبوعياً لمدة ${b.recurringWeeks} أسبوع` : null} />
                <Row label="عدد الحضور" value={b.attendees ? `${b.attendees} شخص` : null} />
                <Row label="ترتيب الجلوس" value={b.seatingLayout} />
                <Row label="التجهيزات" value={b.requestedItems?.length ? b.requestedItems.join("، ") : null} />
                <Row label="الضيافة" value={[b.needsCatering && `ضيافة${b.cateringApproved === false ? " (مرفوضة)" : ""}`, b.needsMeals && `وجبات${b.mealsApproved === false ? " (مرفوضة)" : ""}`].filter(Boolean).join(" ، ") || null} />
                <Row label="المنسق" value={b.coordinatorName ? <>{b.coordinatorName} <span dir="ltr">{b.coordinatorPhone}</span></> : null} />
                <Row label="ملاحظات" value={b.notes} />
                <Row label="ملاحظة الموافقة" value={b.approverNote} />
                <Row label="الحالة" value={<b>{BOOKING_STATUS[b.status]?.label ?? b.status}</b>} />
              </tbody>
            </table>
            {(print?.showQr ?? true) && (
              <div className="w-40 shrink-0 text-center space-y-1">
                <img src={b.qr} alt="QR" className="w-40 h-40 border border-slate-300 p-1" />
                <p className="text-[10px] text-slate-500 leading-4">امسح الرمز للتحقق من صحة الحجز وحالته</p>
                <p className="text-[11px] font-mono font-bold">{b.publicCode}</p>
              </div>
            )}
          </div>
          {/* Signatory title only, on the left side of the page */}
          <div className="flex justify-end pt-36 text-sm">
            <p className="font-bold text-center w-1/2">{print?.signatureTitle?.trim() || "مدير العلاقات"}</p>
          </div>
        </div>
      )}
    </PrintLayout>
  );
}
