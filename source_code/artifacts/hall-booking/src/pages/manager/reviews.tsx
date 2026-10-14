import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Star as StarIcon } from "lucide-react";
import { useListHalls, useListHallReviews, getListHallReviewsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Star, MessageSquare, Trophy } from "lucide-react";
import { useState } from "react";
import { formatDate } from "@/lib/format";

function StarDisplay({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={`w-4 h-4 ${i <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/50"}`} />
      ))}
    </div>
  );
}

function rankBadgeClass(rank: number) {
  if (rank === 0) return "bg-amber-100 text-amber-700";
  if (rank === 1) return "bg-muted text-muted-foreground";
  if (rank === 2) return "bg-orange-100 text-orange-700";
  return "bg-muted text-muted-foreground";
}

function HallReviewsList({ hallId }: { hallId: number }) {
  const { data: reviews, isLoading } = useListHallReviews(hallId, {
    query: { queryKey: getListHallReviewsQueryKey(hallId) },
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
      </div>
    );
  }

  if (!reviews?.length) {
    return (
      <div className="text-center py-8">
        <MessageSquare className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
        <p className="text-muted-foreground text-sm">لا توجد تقييمات لهذه القاعة بعد</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reviews.map(review => (
        <Card key={review.id} >
          <CardContent className="p-5">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-semibold text-sm text-foreground">{review.user?.departmentName ?? review.user?.username ?? "مستخدم"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{formatDate(review.createdAt)}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <StarDisplay rating={review.overallRating ?? Math.round(((review.cleanlinessRating ?? 3) + (review.equipmentRating ?? 3) + (review.cateringRating ?? 3)) / 3)} />
                <span className="text-xs font-semibold text-amber-600">{review.overallRating ?? "—"}/5</span>
              </div>
            </div>
            {review.comment && (
              <p className="text-sm text-muted-foreground mt-2 leading-relaxed bg-muted/40 rounded-lg p-3">{review.comment}</p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function ManagerReviews() {
  const { data: halls, isLoading } = useListHalls();
  const [openHallId, setOpenHallId] = useState<string | undefined>(undefined);

  const rankedHalls = [...(halls ?? [])].sort((a, b) => {
    const ratingA = a.averageRating ?? -1;
    const ratingB = b.averageRating ?? -1;
    if (ratingB !== ratingA) return ratingB - ratingA;
    return (b.reviewCount ?? 0) - (a.reviewCount ?? 0);
  });

  return (
    <MainLayout>
      <div className="space-y-5">
        <PageHeader icon={StarIcon} title="تقييمات القاعات" description="ترتيب جميع القاعات من الأعلى تقييماً إلى الأقل" />

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
        ) : !rankedHalls.length ? (
          <div className="text-center py-16 bg-card rounded-xl shadow-sm border-0">
            <Trophy className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">لا توجد قاعات مضافة بعد</p>
          </div>
        ) : (
          <Card >
            <CardContent className="p-2 sm:p-4">
              <Accordion
                type="single"
                collapsible
                value={openHallId}
                onValueChange={setOpenHallId}
              >
                {rankedHalls.map((hall, idx) => (
                  <AccordionItem key={hall.id} value={String(hall.id)} className="border-border">
                    <AccordionTrigger className="px-3 hover:no-underline">
                      <div className="flex items-center gap-3 flex-1">
                        <span className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-sm font-bold ${rankBadgeClass(idx)}`}>
                          {idx + 1}
                        </span>
                        <div className="flex-1 text-right">
                          <p className="font-semibold text-sm text-foreground">{hall.nameAr || hall.name}</p>
                          <p className="text-xs text-muted-foreground">{hall.reviewCount ?? 0} تقييم</p>
                        </div>
                        <div className="flex items-center gap-2 pl-2">
                          {hall.averageRating != null ? (
                            <>
                              <StarDisplay rating={Math.round(hall.averageRating)} />
                              <span className="text-sm font-semibold text-amber-600">{hall.averageRating.toFixed(1)}</span>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground">بلا تقييم</span>
                          )}
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-3">
                      {openHallId === String(hall.id) && <HallReviewsList hallId={hall.id} />}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
