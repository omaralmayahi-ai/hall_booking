import { useParams } from "wouter";
import { useGetPublicHall, getGetPublicHallQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Building2, Clock, Info, MapPin, Navigation, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePublicSettings } from "@/components/layout/use-public-settings";

const STATUS_AR: Record<string, string> = {
  available: "متاحة للحجز",
  maintenance: "تحت الصيانة",
  disabled: "غير متاحة",
};

/** Public hall card — the page opened by scanning a hall's QR code (no login needed). */
export default function PublicHall() {
  const { id } = useParams<{ id: string }>();
  const { data: settings } = usePublicSettings();
  const { data: hall, isLoading, isError } = useGetPublicHall(Number(id), {
    query: { enabled: !!id, queryKey: getGetPublicHallQueryKey(Number(id)) },
  });

  if (isError) {
    return (
      <div className="min-h-svh bg-background flex items-center justify-center p-4" dir="rtl">
        <Card className="max-w-md w-full text-center p-8">
          <Info className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">القاعة غير موجودة</h2>
          <p className="text-muted-foreground">تعذر العثور على معلومات القاعة المطلوبة أو أنها غير متاحة.</p>
        </Card>
      </div>
    );
  }

  const occupied = hall?.isCurrentlyOccupied;

  return (
    <div className="min-h-svh bg-background pb-12" dir="rtl">
      <div className="h-56 md:h-80 w-full bg-muted relative">
        {isLoading ? (
          <Skeleton className="w-full h-full rounded-none" />
        ) : hall?.images && hall.images.length > 0 ? (
          <img src={hall.images[0].url} alt={hall.nameAr || hall.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary to-primary/70">
            <Building2 className="w-16 h-16 text-primary-foreground/40" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 -mt-16 relative z-10">
        <Card>
          <CardContent className="p-6 md:p-8">
            {isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : hall ? (
              <div className="space-y-6">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <h1 className="text-2xl md:text-3xl font-bold mb-2">{hall.nameAr || hall.name}</h1>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <MapPin className="w-4 h-4 shrink-0" />
                      <span>{hall.locationAr || hall.location}</span>
                    </div>
                  </div>
                  <Badge className={`text-sm px-3 py-1 shrink-0 ${occupied ? "bg-red-600 text-white border-red-700" : "bg-emerald-600 text-white border-emerald-700"}`}>
                    {occupied ? "مشغولة الآن" : "متاحة الآن"}
                  </Badge>
                </div>

                {occupied && hall.currentBooking && (
                  <div className="flex items-center gap-2 rounded-lg bg-amber-50 text-amber-800 px-3 py-2 text-sm">
                    <Clock className="w-4 h-4" />
                    محجوزة اليوم من {String(hall.currentBooking.startTime ?? "").slice(0, 5)} إلى {String(hall.currentBooking.endTime ?? "").slice(0, 5)}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 py-4 border-y">
                  <div className="flex flex-col gap-1">
                    <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <Users className="w-4 h-4" /> السعة
                    </span>
                    <span className="font-semibold text-lg">{hall.capacity} شخص</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-sm text-muted-foreground">حالة القاعة</span>
                    <span className="font-semibold text-lg">{STATUS_AR[hall.status] ?? hall.status}</span>
                  </div>
                </div>

                {hall.equipment && hall.equipment.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-3">التجهيزات المتوفرة</h3>
                    <div className="flex flex-wrap gap-2">
                      {hall.equipment.map((item, idx) => (
                        <Badge key={idx} variant="secondary" className="font-normal text-sm px-3 py-1">{item}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {hall.latitude != null && hall.longitude != null && (
                  <div>
                    <h3 className="font-semibold mb-3">الموقع</h3>
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-muted rounded-lg p-4 border">
                      <span className="font-mono text-sm" dir="ltr">{hall.latitude.toFixed(6)}, {hall.longitude.toFixed(6)}</span>
                      <Button asChild size="sm" variant="outline">
                        <a href={`https://www.google.com/maps/search/?api=1&query=${hall.latitude},${hall.longitude}`} target="_blank" rel="noopener noreferrer">
                          <Navigation className="w-4 h-4" /> فتح في الخرائط
                        </a>
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="text-center mt-8 text-sm text-muted-foreground">
          <p>{settings?.footerTextAr || `${settings?.companyNameAr || "منصة حجز القاعات"} © ${new Date().getFullYear()}`}</p>
        </div>
      </div>
    </div>
  );
}
