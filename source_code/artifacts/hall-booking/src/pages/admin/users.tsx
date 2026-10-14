import { useState } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/layout/page-header";
import { Users as UsersIcon } from "lucide-react";
import {
  useListUsers, useCreateUser, useUpdateUser, useDeleteUser, useToggleUserStatus,
  getListUsersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, Users } from "lucide-react";
import { useForm, Controller } from "react-hook-form";

const ROLE_AR: Record<string, string> = {
  admin: "مدير النظام",
  relations_manager: "مدير العلاقات",
  requesting_department: "جهة طالبة",
};

interface UserForm {
  username: string;
  password: string;
  role: string;
  departmentName: string;
}

export default function AdminUsers() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: users, isLoading } = useListUsers();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const toggleStatus = useToggleUserStatus();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  const { register, handleSubmit, reset, control, formState: { errors, isSubmitting } } = useForm<UserForm>({
    defaultValues: { username: "", password: "", role: "requesting_department", departmentName: "" },
  });

  const openAdd = () => {
    setEditingUser(null);
    reset({ username: "", password: "", role: "requesting_department", departmentName: "" });
    setDialogOpen(true);
  };

  const openEdit = (user: any) => {
    setEditingUser(user);
    reset({ username: user.username, password: "", role: user.role, departmentName: user.departmentName ?? "" });
    setDialogOpen(true);
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: getListUsersQueryKey() });

  const onSubmit = async (values: UserForm) => {
    try {
      if (editingUser) {
        const body: any = { role: values.role as any, departmentName: values.departmentName || undefined };
        if (values.password) body.password = values.password;
        await updateUser.mutateAsync({ id: editingUser.id, data: body });
        toast({ title: "تم تعديل المستخدم بنجاح" });
      } else {
        await createUser.mutateAsync({ data: { username: values.username, password: values.password, role: values.role as any, departmentName: values.departmentName || undefined } });
        toast({ title: "تم إضافة المستخدم بنجاح" });
      }
      setDialogOpen(false);
      invalidate();
    } catch (e: any) {
      toast({ variant: "destructive", title: "خطأ", description: e?.data?.error || "فشلت العملية" });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteUser.mutateAsync({ id: deleteTarget.id });
      toast({ title: "تم حذف المستخدم" });
      setDeleteTarget(null);
      invalidate();
    } catch (e: any) {
      toast({ variant: "destructive", title: "خطأ", description: e?.data?.error || "فشل الحذف" });
    }
  };

  const handleToggle = async (user: any) => {
    try {
      await toggleStatus.mutateAsync({ id: user.id });
      toast({ title: user.isActive ? "تم تعطيل المستخدم" : "تم تفعيل المستخدم" });
      invalidate();
    } catch (e: any) {
      toast({ variant: "destructive", title: "خطأ", description: e?.data?.error || "فشلت العملية" });
    }
  };

  return (
    <MainLayout>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <PageHeader icon={UsersIcon} title="إدارة المستخدمين" description="إضافة وتعديل وإدارة حسابات المستخدمين" />
          <Button onClick={openAdd} className="gap-2 bg-primary hover:bg-primary/90">
            <Plus className="w-4 h-4" />
            إضافة مستخدم
          </Button>
        </div>

        <Card >
          <CardHeader className="pb-2 flex flex-row items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            <CardTitle className="text-base">قائمة المستخدمين ({users?.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>اسم المستخدم</TableHead>
                  <TableHead>الدور</TableHead>
                  <TableHead>الجهة</TableHead>
                  <TableHead>الحالة</TableHead>
                  <TableHead>الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array(5).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      {[1,2,3,4,5].map(j => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                    </TableRow>
                  ))
                ) : !users?.length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">لا يوجد مستخدمون</TableCell>
                  </TableRow>
                ) : users.map(user => (
                  <TableRow key={user.id} className="hover:bg-muted/40">
                    <TableCell className="font-medium">{user.username}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal">
                        {ROLE_AR[user.role] ?? user.role}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{user.departmentName ?? "—"}</TableCell>
                    <TableCell>
                      {user.isActive
                        ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">نشط</Badge>
                        : <Badge variant="secondary" className="bg-red-50 text-red-600 hover:bg-red-50">معطل</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => openEdit(user)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-amber-600" onClick={() => handleToggle(user)} title={user.isActive ? "تعطيل" : "تفعيل"}>
                          {user.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                        </Button>
                        {!user.isPrimary && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-red-600" onClick={() => setDeleteTarget(user)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingUser ? "تعديل المستخدم" : "إضافة مستخدم جديد"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label>اسم المستخدم</Label>
              <Input {...register("username", { required: !editingUser })} disabled={!!editingUser} placeholder="أدخل اسم المستخدم" />
              {errors.username && <p className="text-xs text-red-500">هذا الحقل مطلوب</p>}
            </div>
            <div className="space-y-1.5">
              <Label>{editingUser ? "كلمة المرور الجديدة (اتركها فارغة للإبقاء على الحالية)" : "كلمة المرور"}</Label>
              <Input {...register("password", { required: !editingUser })} type="password" placeholder="••••••••" dir="ltr" />
              {errors.password && <p className="text-xs text-red-500">هذا الحقل مطلوب</p>}
            </div>
            <div className="space-y-1.5">
              <Label>الدور</Label>
              <Controller name="role" control={control} rules={{ required: true }} render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger><SelectValue placeholder="اختر الدور" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">مدير النظام</SelectItem>
                    <SelectItem value="relations_manager">مدير العلاقات</SelectItem>
                    <SelectItem value="requesting_department">جهة طالبة</SelectItem>
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <Label>اسم الجهة (اختياري)</Label>
              <Input {...register("departmentName")} placeholder="مثال: الموارد البشرية" />
            </div>
            <DialogFooter className="gap-2 flex-row-reverse sm:justify-start">
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-primary/90">
                {isSubmitting ? "جاري الحفظ..." : editingUser ? "حفظ التعديلات" : "إضافة المستخدم"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف المستخدم <strong>{deleteTarget?.username}</strong>؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDelete}>حذف</AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
