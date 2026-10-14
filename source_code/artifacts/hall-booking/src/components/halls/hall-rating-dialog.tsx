import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useListHallReviews, getListHallReviewsQueryKey } from "@workspace/api-client-react";
import { Star, MessageSquare } from "lucide-react";
import { formatDate } from "@/lib/format";

export function StarDisplay({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={`w-4 h-4 ${i <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/50"}`} />
      ))}
    </div>
  );
}

interface HallRatingDialogProps {
  hall: { id: number; nameAr?: string | null; name: string; averageRating?: number | null; reviewCount?: number | null } | null;
  onClose: () => void;
}

export function HallRatingDialog({ hall, onClose }: HallRatingDialogProps) {
  const { data: reviews, isLoading } = useListHallReviews(hall?.id ?? 0, {
    query: { queryKey: getListHallReviewsQueryKey(hall?.id ?? 0), enabled: !!hall },
  });

  return (
    <Dialog open={!!hall} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>تقييمات — {hall?.nameAr || hall?.name}</DialogTitle>
        </DialogHeader>

        {hall?.averageRating != null && (
          <div className="flex items-center justify-between bg-amber-50 rounded-xl p-3">
            <div className="flex items-center gap-2">
              <StarDisplay rating={Math.round(hall.averageRating)} />
              <span className="text-sm font-semibold text-amber-700">{Number(hall.averageRating).toFixed(1)} / 5</span>
            </div>
            <span className="text-xs text-muted-foreground">{hall.reviewCount ?? 0} تقييم</span>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map(i => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
          </div>
        ) : !reviews?.length ? (
          <div className="text-center py-8">
            <MessageSquare className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-muted-foreground text-sm">لا توجد تقييمات لهذه القاعة بعد</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map(review => (
              <Card key={review.id} >
                <CardContent className="p-4">
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
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
