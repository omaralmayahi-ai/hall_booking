import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, CalendarDays, Clock, Loader2, MapPin, ShieldAlert, Users2 } from "lucide-react";
import { systemNameOf, usePublicSettings } from "@/components/layout/use-public-settings";
import { longDate } from "@/lib/calendar";

interface Verify {
  id: number; status: string; statusAr: string; valid: boolean; hall: string; location: string; department: string; activityType: string;
  startDate: string; endDate: string; startTime: string; endTime: string; isRecurring: boolean; recurringWeeks: number | null;
}

/** Opened by scanning the QR on a printed booking notice — confirms that the booking is genuine and still valid. */
export default function VerifyBooking() {
  const { code } = useParams<{ code: string }>();
  const { data: s } = usePublicSettings();
  const { data, isLoading, isError } = useQuery<Verify>({
    queryKey: ["verify", code],
    queryFn: async () => {
      const r = await fetch(`/api/public/bookings/${encodeURIComponent(code)}`);
      if (!r.ok) throw new Error("not found");
      return r.json();
    },
    retry: false,
  });
  return (
    <div className="min-h-svh bg-gradient-to-b from-primary/10 to-background flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md bg-card rounded-2xl border shadow-sm overflow-hidden">
        <div className="bg-primary text-primary-foreground px-5 py-4 flex items-center gap-3">
          <img src={`/icons/icon-192.png?v=${s?.iconVersion ?? ""}`} alt="" className="w-10 h-10 rounded-lg bg-white/10" />
          <div>
            <p className="font-bold">{systemNameOf(s)}</p>
            <p className="text-xs opacity-80">التحقق من إشعار حجز</p>
          </div>
        </div>
        <div className="p-5">
          {isLoading ? (
            <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : isError || !data ? (
            <div className="text-center py-6 space-y-2">
              <ShieldAlert className="w-14 h-14 text-red-500 mx-auto" />
              <p className="font-bold text-lg">الإشعار غير صحيح</p>
              <p className="text-sm text-muted-foreground">لم يتم العثور على حجز بهذا الرمز.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className={`rounded-xl p-4 text-center ${data.valid ? "bg-emerald-50 text-emerald-800 border border-emerald-200" : "bg-amber-50 text-amber-800 border border-amber-200"}`}>
                {data.valid ? <BadgeCheck className="w-10 h-10 mx-auto mb-1" /> : <ShieldAlert className="w-10 h-10 mx-auto mb-1" />}
                <p className="font-bold">{data.valid ? "حجز صحيح ومعتمد" : `حالة الحجز: ${data.statusAr}`}</p>
                <p className="text-xs opacity-80">رقم الحجز #{data.id}</p>
              </div>
              <dl className="space-y-2.5 text-sm">
                <div className="flex gap-2"><MapPin className="w-4 h-4 text-primary mt-0.5" /><div><dt className="text-xs text-muted-foreground">القاعة</dt><dd className="font-semibold">{data.hall} — {data.location}</dd></div></div>
                <div className="flex gap-2"><Users2 className="w-4 h-4 text-primary mt-0.5" /><div><dt className="text-xs text-muted-foreground">الجهة / النشاط</dt><dd className="font-semibold">{data.department} — {data.activityType}</dd></div></div>
                <div className="flex gap-2"><CalendarDays className="w-4 h-4 text-primary mt-0.5" /><div><dt className="text-xs text-muted-foreground">التاريخ</dt><dd className="font-semibold">{longDate(data.startDate)}{data.endDate !== data.startDate ? ` — ${longDate(data.endDate)}` : ""}{data.isRecurring ? ` (أسبوعياً ${data.recurringWeeks} أسبوع)` : ""}</dd></div></div>
                <div className="flex gap-2"><Clock className="w-4 h-4 text-primary mt-0.5" /><div><dt className="text-xs text-muted-foreground">الوقت</dt><dd className="font-semibold tabular-nums" dir="ltr">{data.startTime} – {data.endTime}</dd></div></div>
              </dl>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
