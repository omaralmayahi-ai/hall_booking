import { useMemo, useState } from "react";
import { useListHalls } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Users, Star, Building2, CalendarPlus, Search, UtensilsCrossed, Layers } from "lucide-react";
import { HallRatingDialog } from "@/components/halls/hall-rating-dialog";
import { BookingDialog, type BookableHall } from "@/components/booking/booking-dialog";
import { PageHeader } from "@/components/layout/page-header";

const CAPACITY_FILTERS = [
  { value: 0, label: "الكل" },
  { value: 20, label: "20+" },
  { value: 50, label: "50+" },
  { value: 100, label: "100+" },
];

export default function DepartmentHalls() {
  const { data: halls, isLoading } = useListHalls({ status: "available" });
  const [selectedHall, setSelectedHall] = useState<BookableHall | null>(null);
  const [ratingHall, setRatingHall] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [minCap, setMinCap] = useState(0);

  const filtered = useMemo(() => {
    const q = search.trim();
    return (halls ?? []).filter(
      (h) =>
        h.capacity >= minCap &&
        (!q || [h.nameAr, h.name, h.locationAr, h.location, ...(h.equipment ?? [])].some((v) => v?.includes(q))),
    );
  }, [halls, search, minCap]);

  return (
    <div className="space-y-5">
      <PageHeader icon={Building2} title="القاعات المتاحة" description="اختر القاعة المناسبة، وسيظهر لك تقويم الأيام المحجوزة والأوقات المتاحة قبل تقديم الطلب" />

      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث باسم القاعة أو الموقع أو التجهيزات..." className="pr-9" />
        </div>
        <div className="flex items-center gap-1 rounded-lg border bg-card p-1 self-start">
          <Users className="w-4 h-4 text-muted-foreground mx-1.5" />
          {CAPACITY_FILTERS.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setMinCap(c.value)}
              className={`text-xs px-2.5 py-1 rounded-md transition-colors ${minCap === c.value ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array(6).fill(0).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <Skeleton className="h-44 w-full rounded-none" />
              <div className="p-4 space-y-2">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            </Card>
          ))}
        </div>
      ) : !filtered.length ? (
        <div className="text-center py-16 bg-card rounded-xl border">
          <Building2 className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">{halls?.length ? "لا توجد قاعات مطابقة للبحث" : "لا توجد قاعات متاحة حالياً"}</p>
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((hall) => (
            <Card key={hall.id} className="overflow-hidden flex flex-col hover:shadow-md transition-shadow duration-200 group">
              <div className="h-44 bg-gradient-to-br from-primary to-primary/70 relative overflow-hidden">
                {hall.images && hall.images.length > 0 ? (
                  <img src={hall.images[0].url} alt={hall.nameAr || hall.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Building2 className="w-14 h-14 text-white/25" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/5 to-transparent" />
                <div className="absolute bottom-3 right-3 left-3 flex items-end justify-between gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/95 text-slate-800 text-xs font-semibold px-2.5 py-1 shadow-sm">
                    <Users className="w-3.5 h-3.5 text-primary" />
                    {hall.capacity} شخص
                  </span>
                  {hall.averageRating ? (
                    <button
                      type="button"
                      onClick={() => setRatingHall(hall)}
                      className="inline-flex items-center gap-1 rounded-full bg-white/95 text-slate-800 text-xs font-semibold px-2.5 py-1 shadow-sm hover:bg-white"
                    >
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      {Number(hall.averageRating).toFixed(1)}
                      <span className="text-slate-500 font-normal">({hall.reviewCount})</span>
                    </button>
                  ) : null}
                </div>
              </div>

              <CardContent className="p-4 flex-1 flex flex-col gap-3">
                <div>
                  <h3 className="font-bold text-foreground text-base leading-tight">{hall.nameAr || hall.name}</h3>
                  <div className="flex items-center gap-1 text-muted-foreground text-xs mt-1">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{hall.locationAr || hall.location}</span>
                    {hall.floor && (
                      <>
                        <span className="text-muted-foreground/40">•</span>
                        <Layers className="w-3.5 h-3.5 shrink-0" />
                        <span>الطابق {hall.floor}</span>
                      </>
                    )}
                  </div>
                </div>

                {(hall.equipment?.length ?? 0) > 0 || hall.providesHospitality ? (
                  <div className="flex flex-wrap gap-1">
                    {hall.providesHospitality && (
                      <Badge variant="outline" className="text-[11px] border-amber-300 text-amber-700 bg-amber-50">
                        <UtensilsCrossed className="w-3 h-3" /> ضيافة
                      </Badge>
                    )}
                    {hall.equipment?.slice(0, 4).map((eq, i) => (
                      <Badge key={i} variant="secondary" className="text-[11px] font-normal">{eq}</Badge>
                    ))}
                    {(hall.equipment?.length ?? 0) > 4 && <Badge variant="secondary" className="text-[11px]">+{hall.equipment!.length - 4}</Badge>}
                  </div>
                ) : null}

                <div className="mt-auto pt-3 border-t">
                  <Button className="w-full" onClick={() => setSelectedHall(hall as BookableHall)}>
                    <CalendarPlus className="w-4 h-4" />
                    عرض المواعيد وحجز القاعة
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <BookingDialog open={!!selectedHall} onOpenChange={(v) => !v && setSelectedHall(null)} hall={selectedHall} mode="department" />
      <HallRatingDialog hall={ratingHall} onClose={() => setRatingHall(null)} />
    </div>
  );
}
