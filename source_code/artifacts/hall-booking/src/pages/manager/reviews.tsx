import { useState } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/layout/page-header";
import { useListHalls, useListHallReviews, getListHallReviewsQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { MessageSquareQuote, Star, Building2 } from "lucide-react";
import { formatDate } from "@/lib/format";
import { EmptyState, SectionTitle } from "@/components/booking/ticket";
import { cn } from "@/lib/utils";

function Stars({ value, size = "w-4 h-4" }: { value: number; size?: string }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${value.toFixed(1)} من 5`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        return (
          <span key={i} className={cn("relative inline-block", size)}>
            <Star className={cn("absolute inset-0 text-muted-foreground/30", size)} />
            <span className="absolute inset-y-0 right-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className={cn("fill-amber-400 text-amber-400", size)} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

function HallReviewsList({ hallId }: { hallId: number }) {
  const { data: reviews, isLoading } = useListHallReviews(hallId, { query: { queryKey: getListHallReviewsQueryKey(hallId) } });
  if (isLoading) return <div className="space-y-2 pb-2">{[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>;
  if (!reviews?.length) return <p className="text-sm text-muted-foreground py-4">لا توجد تقييمات مكتوبة لهذه القاعة.</p>;
  return (
    <ul className="space-y-2.5 pb-2">
      {reviews.map((r) => {
        const score = r.overallRating ?? ((r.cleanlinessRating ?? 3) + (r.equipmentRating ?? 3) + (r.cateringRating ?? 3)) / 3;
        return (
          <li key={r.id} className="rounded-xl bg-muted/40 p-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="font-semibold text-sm">{r.user?.departmentName ?? r.user?.username ?? "جهة"}</p>
              <Stars value={score} size="w-3.5 h-3.5" />
              <span className="text-xs text-muted-foreground mr-auto">{formatDate(r.createdAt)}</span>
            </div>
            {r.comment ? (
              <p className="text-sm leading-relaxed mt-2 border-r-2 border-amber-400/70 pr-3">{r.comment}</p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1.5">بدون تعليق</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function ManagerReviews() {
  const { data: halls, isLoading } = useListHalls();
  const [open, setOpen] = useState<string | undefined>(undefined);

  const rated = [...(halls ?? [])]
    .filter((h) => h.averageRating != null && (h.reviewCount ?? 0) > 0)
    .sort((a, b) => (b.averageRating ?? 0) - (a.averageRating ?? 0) || (b.reviewCount ?? 0) - (a.reviewCount ?? 0));
  const unrated = (halls ?? []).filter((h) => !rated.includes(h));
  const totalReviews = rated.reduce((n, h) => n + (h.reviewCount ?? 0), 0);
  const overall = totalReviews ? rated.reduce((n, h) => n + (h.averageRating ?? 0) * (h.reviewCount ?? 0), 0) / totalReviews : 0;

  return (
    <MainLayout>
      <div className="space-y-5 max-w-5xl">
        <PageHeader icon={Star} title="تقييمات القاعات" description="رأي الجهات في القاعات بعد انتهاء حجوزاتها، من الأعلى تقييماً إلى الأقل" />

        {isLoading ? (
          <div className="space-y-3"><Skeleton className="h-28 rounded-2xl" />{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : !halls?.length ? (
          <EmptyState icon={Building2} title="لا توجد قاعات مضافة" />
        ) : (
          <>
            {totalReviews > 0 && <section className="rounded-2xl border bg-card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-5">
              <div className="flex items-center gap-4">
                <p className="text-5xl font-black tabular-nums leading-none">{totalReviews ? overall.toFixed(1) : "—"}</p>
                <div>
                  <Stars value={overall} size="w-5 h-5" />
                  <p className="text-sm text-muted-foreground mt-1">متوسط كل التقييمات</p>
                </div>
              </div>
              <div className="sm:mr-auto flex gap-6 text-sm">
                <div><p className="text-2xl font-bold tabular-nums">{totalReviews}</p><p className="text-muted-foreground">تقييم</p></div>
                <div><p className="text-2xl font-bold tabular-nums">{rated.length}<span className="text-base text-muted-foreground font-medium"> / {halls.length}</span></p><p className="text-muted-foreground">قاعة مُقيَّمة</p></div>
              </div>
            </section>}

            {!rated.length ? (
              <EmptyState icon={MessageSquareQuote} title="لا توجد تقييمات بعد" hint="تستطيع الجهة تقييم القاعة من «حجوزاتي» بعد انتهاء حجزها." />
            ) : (
              <section className="space-y-3">
                <SectionTitle count={rated.length}>الترتيب</SectionTitle>
                <Accordion type="single" collapsible value={open} onValueChange={setOpen} className="rounded-2xl border bg-card divide-y overflow-hidden">
                  {rated.map((h, i) => (
                    <AccordionItem key={h.id} value={String(h.id)} className="border-0">
                      <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-muted/40 [&[data-state=open]]:bg-muted/40">
                        <div className="flex items-center gap-4 flex-1 min-w-0 text-right">
                          <span className={cn("w-9 h-9 rounded-xl flex items-center justify-center font-black tabular-nums shrink-0", i === 0 ? "bg-amber-400 text-amber-950" : "bg-muted text-muted-foreground")}>{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <p className="font-bold truncate">{h.nameAr || h.name}</p>
                            <div className="flex items-center gap-2 mt-1.5">
                              <div className="h-2 flex-1 max-w-56 rounded-full bg-muted overflow-hidden">
                                <div className="h-full rounded-full bg-amber-400" style={{ width: `${((h.averageRating ?? 0) / 5) * 100}%` }} />
                              </div>
                              <span className="text-xs text-muted-foreground tabular-nums">{h.reviewCount} تقييم</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 pl-2">
                            <span className="hidden sm:inline-flex"><Stars value={h.averageRating ?? 0} /></span>
                            <span className="text-lg font-black tabular-nums w-9 text-left">{(h.averageRating ?? 0).toFixed(1)}</span>
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="px-5">
                        {open === String(h.id) && <HallReviewsList hallId={h.id} />}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </section>
            )}

            {unrated.length > 0 && (
              <section className="space-y-3">
                <SectionTitle count={unrated.length}>لم تُقيَّم بعد</SectionTitle>
                <div className="flex flex-wrap gap-2">
                  {unrated.map((h) => (
                    <span key={h.id} className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm text-muted-foreground">
                      <Building2 className="w-3.5 h-3.5" />{h.nameAr || h.name}
                    </span>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}
