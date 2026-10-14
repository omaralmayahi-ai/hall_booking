import { useState } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/layout/page-header";
import { UserCog as UserCogIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useChangePassword, useCreatePasswordResetRequest } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { User, Lock, KeyRound, ShieldCheck } from "lucide-react";

const ROLE_AR: Record<string, string> = {
  admin: "مدير النظام",
  relations_manager: "مدير العلاقات",
  requesting_department: "جهة طالبة",
};

interface PasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export default function ManagerProfile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const changePassword = useChangePassword();
  const requestReset = useCreatePasswordResetRequest();
  const [resetSent, setResetSent] = useState(false);

  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<PasswordForm>({
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  const newPwd = watch("newPassword");

  const onSubmit = async (values: PasswordForm) => {
    if (values.newPassword !== values.confirmPassword) {
      toast({ variant: "destructive", title: "كلمتا المرور غير متطابقتين" });
      return;
    }
    try {
      await changePassword.mutateAsync({ data: { currentPassword: values.currentPassword, newPassword: values.newPassword } });
      toast({ title: "تم تغيير كلمة المرور بنجاح" });
      reset();
    } catch (e: any) {
      toast({ variant: "destructive", title: "فشل تغيير كلمة المرور", description: e?.data?.error ?? "" });
    }
  };

  const handleRequestReset = async () => {
    try {
      await requestReset.mutateAsync({ data: { username: user?.username ?? "" } });
      setResetSent(true);
      toast({ title: "تم إرسال طلب إعادة كلمة المرور لمدير النظام" });
    } catch {
      toast({ variant: "destructive", title: "فشل إرسال الطلب" });
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6 max-w-2xl">
        <PageHeader icon={UserCogIcon} title="ملف الحساب" description="إدارة بياناتك الشخصية وكلمة المرور" />

        {/* Profile Info */}
        <Card >
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">معلومات الحساب</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 p-4 bg-muted/40 rounded-xl">
              <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center text-white font-bold text-xl">
                {user?.username?.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-lg font-bold text-foreground">{user?.username}</p>
                <p className="text-sm text-muted-foreground">{ROLE_AR[user?.role ?? ""] ?? user?.role}</p>
                {user?.departmentName && <p className="text-xs text-muted-foreground mt-0.5">{user.departmentName}</p>}
              </div>
              <div className="mr-auto">
                <div className="flex items-center gap-1 text-emerald-600 text-sm font-medium bg-emerald-50 px-3 py-1.5 rounded-full">
                  <ShieldCheck className="w-4 h-4" />
                  حساب نشط
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card >
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-emerald-500" />
              <CardTitle className="text-base">تغيير كلمة المرور</CardTitle>
            </div>
            <CardDescription>يُنصح بتغيير كلمة المرور بشكل دوري لحماية حسابك</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label>كلمة المرور الحالية</Label>
                <Input
                  type="password"
                  {...register("currentPassword", { required: "مطلوب" })}
                  placeholder="••••••••"
                  dir="ltr"
                />
                {errors.currentPassword && <p className="text-xs text-red-500">{errors.currentPassword.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>كلمة المرور الجديدة</Label>
                <Input
                  type="password"
                  {...register("newPassword", { required: "مطلوب", minLength: { value: 6, message: "6 رموز على الأقل" } })}
                  placeholder="••••••••"
                  dir="ltr"
                />
                {errors.newPassword && <p className="text-xs text-red-500">{errors.newPassword.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label>تأكيد كلمة المرور الجديدة</Label>
                <Input
                  type="password"
                  {...register("confirmPassword", {
                    required: "مطلوب",
                    validate: v => v === newPwd || "كلمتا المرور غير متطابقتين",
                  })}
                  placeholder="••••••••"
                  dir="ltr"
                />
                {errors.confirmPassword && <p className="text-xs text-red-500">{errors.confirmPassword.message}</p>}
              </div>
              <Button type="submit" disabled={isSubmitting} className="w-full bg-primary hover:bg-primary/90 h-11">
                {isSubmitting ? "جاري التغيير..." : "تغيير كلمة المرور"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Request Reset */}
        <Card >
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-amber-500" />
              <CardTitle className="text-base">نسيت كلمة المرور؟</CardTitle>
            </div>
            <CardDescription>إذا نسيت كلمة المرور الحالية يمكنك إرسال طلب لمدير النظام</CardDescription>
          </CardHeader>
          <CardContent>
            {resetSent ? (
              <div className="p-4 bg-emerald-50 rounded-xl text-emerald-700 text-sm font-medium text-center">
                ✅ تم إرسال طلب إعادة تعيين كلمة المرور — سيتم مراجعته من قبل مدير النظام
              </div>
            ) : (
              <Button
                variant="outline"
                onClick={handleRequestReset}
                disabled={requestReset.isPending}
                className="w-full"
              >
                {requestReset.isPending ? "جاري الإرسال..." : "إرسال طلب إعادة تعيين كلمة المرور"}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
