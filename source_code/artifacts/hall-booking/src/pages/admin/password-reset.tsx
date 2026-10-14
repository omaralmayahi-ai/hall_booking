import { useState } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/layout/page-header";
import { KeyRound as KeyRoundIcon } from "lucide-react";
import { useListPasswordResetRequests, useResolvePasswordResetRequest, getListPasswordResetRequestsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { KeyRound, CheckCircle, XCircle } from "lucide-react";
import { formatDateTime } from "@/lib/format";

export default function AdminPasswordReset() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: requests, isLoading } = useListPasswordResetRequests();
  const resolve = useResolvePasswordResetRequest();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [action, setAction] = useState<"approve" | "reject">("approve");
  const [newPassword, setNewPassword] = useState("");

  const openDialog = (req: any, act: "approve" | "reject") => {
    setSelected(req);
    setAction(act);
    setNewPassword("");
    setDialogOpen(true);
  };

  const handleResolve = async () => {
    if (!selected) return;
    try {
      await resolve.mutateAsync({
        id: selected.id,
        data: {
          action,
          newPassword: action === "approve" ? newPassword : undefined,
        } as any,
      });
      toast({ title: action === "approve" ? "تمت الموافقة وتغيير كلمة المرور" : "تم رفض الطلب" });
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: getListPasswordResetRequestsQueryKey() });
    } catch (e: any) {
      toast({ variant: "destructive", title: "فشلت العملية", description: e?.data?.error ?? "" });
    }
  };

  return (
    <MainLayout>
      <div className="space-y-5">
        <PageHeader icon={KeyRoundIcon} title="طلبات إعادة كلمة المرور" description="مراجعة وإدارة طلبات إعادة تعيين كلمات المرور" />

        <Card >
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <KeyRound className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">الطلبات ({requests?.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>المستخدم</TableHead>
                  <TableHead>تاريخ الطلب</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array(4).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      {[1,2,3,4].map(j => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                    </TableRow>
                  ))
                ) : !requests?.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-10 text-muted-foreground">لا توجد طلبات معلقة</TableCell>
                  </TableRow>
                ) : requests.map((req: any) => (
                  <TableRow key={req.id} className="hover:bg-muted/40">
                    <TableCell className="font-medium">{req.username ?? req.userId}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDateTime(req.createdAt)}</TableCell>
                    <TableCell>
                      {req.status === "pending"
                        ? <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">معلق</Badge>
                        : req.status === "approved"
                        ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">موافق</Badge>
                        : <Badge className="bg-red-100 text-red-700 hover:bg-red-100">مرفوض</Badge>}
                    </TableCell>
                    <TableCell>
                      {req.status === "pending" && (
                        <div className="flex gap-2">
                          <Button size="sm" className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 h-8" onClick={() => openDialog(req, "approve")}>
                            <CheckCircle className="w-3.5 h-3.5" />
                            موافقة
                          </Button>
                          <Button size="sm" variant="outline" className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50 h-8" onClick={() => openDialog(req, "reject")}>
                            <XCircle className="w-3.5 h-3.5" />
                            رفض
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>{action === "approve" ? "الموافقة على الطلب" : "رفض الطلب"}</DialogTitle>
          </DialogHeader>
          {action === "approve" ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">حدد كلمة المرور الجديدة للمستخدم <strong>{selected?.username}</strong></p>
              <div className="space-y-1.5">
                <Label>كلمة المرور الجديدة</Label>
                <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="أدخل كلمة مرور قوية" dir="ltr" />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">هل تريد رفض طلب إعادة كلمة مرور المستخدم <strong>{selected?.username}</strong>؟</p>
          )}
          <DialogFooter className="flex-row-reverse gap-2">
            <Button onClick={handleResolve} disabled={resolve.isPending || (action === "approve" && !newPassword)}
              className={action === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}>
              {resolve.isPending ? "جاري التنفيذ..." : action === "approve" ? "تأكيد الموافقة" : "تأكيد الرفض"}
            </Button>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
