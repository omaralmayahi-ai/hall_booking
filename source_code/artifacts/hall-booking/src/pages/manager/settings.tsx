import { useState } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/layout/page-header";
import { CalendarOff as CalendarOffIcon } from "lucide-react";
import {
  useListHolidays, useCreateHoliday, useDeleteHoliday, getListHolidaysQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { formatDate } from "@/lib/format";

export default function ManagerSettings() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: holidays, isLoading: holidaysLoading } = useListHolidays();
  const createHoliday = useCreateHoliday();
  const deleteHoliday = useDeleteHoliday();

  const [newHoliday, setNewHoliday] = useState({ name: "", nameAr: "", date: "" });

  const handleAddHoliday = async () => {
    if (!newHoliday.date || !newHoliday.nameAr) return;
    try {
      await createHoliday.mutateAsync({ data: { name: newHoliday.name || newHoliday.nameAr, nameAr: newHoliday.nameAr, date: newHoliday.date } });
      toast({ title: "تم إضافة الإجازة" });
      setNewHoliday({ name: "", nameAr: "", date: "" });
      qc.invalidateQueries({ queryKey: getListHolidaysQueryKey() });
    } catch {
      toast({ variant: "destructive", title: "فشل إضافة الإجازة" });
    }
  };

  const handleDeleteHoliday = async (id: number) => {
    try {
      await deleteHoliday.mutateAsync({ id });
      toast({ title: "تم حذف الإجازة" });
      qc.invalidateQueries({ queryKey: getListHolidaysQueryKey() });
    } catch {
      toast({ variant: "destructive", title: "فشل الحذف" });
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <PageHeader icon={CalendarOffIcon} title="إعدادات مدير العلاقات" description="إدارة الإجازات الرسمية التي تمنع الحجز في أيامها" />

        <Card >
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-rose-500" />
              <CardTitle className="text-base">الإجازات الرسمية</CardTitle>
            </div>
            <CardDescription>إضافة وإدارة أيام العطل الرسمية التي لا يُسمح فيها بالحجز</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3 p-4 bg-muted/40 rounded-xl">
              <div className="space-y-1">
                <Label className="text-xs">اسم الإجازة</Label>
                <Input value={newHoliday.nameAr} onChange={e => setNewHoliday(p => ({ ...p, nameAr: e.target.value }))} placeholder="مثال: اليوم الوطني" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">التاريخ</Label>
                <Input type="date" value={newHoliday.date} onChange={e => setNewHoliday(p => ({ ...p, date: e.target.value }))} dir="ltr" />
              </div>
              <div className="flex items-end">
                <Button onClick={handleAddHoliday} disabled={!newHoliday.date || !newHoliday.nameAr} className="w-full gap-2 bg-primary">
                  <Plus className="w-4 h-4" />
                  إضافة
                </Button>
              </div>
            </div>

            {holidaysLoading ? (
              <div className="space-y-2">{[1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : !holidays?.length ? (
              <p className="text-sm text-muted-foreground text-center py-4">لا توجد إجازات رسمية مضافة</p>
            ) : (
              <div className="space-y-2">
                {holidays.map(h => (
                  <div key={h.id} className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/40">
                    <div className="flex items-center gap-3">
                      <CalendarDays className="w-4 h-4 text-rose-400" />
                      <div>
                        <p className="text-sm font-medium">{h.nameAr || h.name}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(h.date)}</p>
                      </div>
                    </div>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50" onClick={() => handleDeleteHoliday(h.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
