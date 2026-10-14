import { useRef, useState } from "react";
import {
  useListHalls, useCreateHall, useUpdateHall, useDeleteHall,
  getListHallsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/layout/page-header";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, MapPin, Users, Building2, Star, Upload, X, QrCode, Download, UtensilsCrossed, MonitorPlay, Armchair, Presentation } from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { HallLocationMap } from "@/components/halls/hall-location-map";
import { HallRatingDialog } from "@/components/halls/hall-rating-dialog";
import { HALL_SERVICES } from "@/lib/hall-services";

const STATUS_AR: Record<string, string> = {
  available: "متاحة",
  unavailable: "غير متاحة",
  maintenance: "صيانة",
};
const STATUS_COLOR: Record<string, string> = {
  available: "bg-emerald-100 text-emerald-700",
  unavailable: "bg-red-100 text-red-700",
  maintenance: "bg-amber-100 text-amber-700",
};

interface HallForm {
  name: string;
  nameAr: string;
  location: string;
  locationAr: string;
  capacity: number;
  floor: string;
  building: string;
  description: string;
  descriptionAr: string;
  status: string;
}

export default function ManagerHalls() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: halls, isLoading } = useListHalls();
  const createHall = useCreateHall();
  const updateHall = useUpdateHall();
  const deleteHall = useDeleteHall();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingHall, setEditingHall] = useState<any>(null);
  const [ratingHall, setRatingHall] = useState<any>(null);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [qrTarget, setQrTarget] = useState<any>(null);

  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [providesHospitality, setProvidesHospitality] = useState(false);

  const toggleService = (value: string) => {
    setSelectedServices(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
  };

  const { register, handleSubmit, reset, control, formState: { errors, isSubmitting } } = useForm<HallForm>({
    defaultValues: { name: "", nameAr: "", location: "", locationAr: "", capacity: 50, floor: "", building: "", description: "", descriptionAr: "", status: "available" },
  });

  const openAdd = () => {
    setEditingHall(null);
    reset({ name: "", nameAr: "", location: "", locationAr: "", capacity: 50, floor: "", building: "", description: "", descriptionAr: "", status: "available" });
    setImagePreview(null);
    setLatitude(null);
    setLongitude(null);
    setSelectedServices([]);
    setProvidesHospitality(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setDialogOpen(true);
  };

  const openEdit = (hall: any) => {
    setEditingHall(hall);
    reset({
      name: hall.name ?? "", nameAr: hall.nameAr ?? "",
      location: hall.location ?? "", locationAr: hall.locationAr ?? "",
      capacity: hall.capacity ?? 50, floor: hall.floor ?? "", building: hall.building ?? "",
      description: hall.description ?? "", descriptionAr: hall.descriptionAr ?? "",
      status: hall.status ?? "available",
    });
    setImagePreview(hall.images?.[0]?.url ?? null);
    setLatitude(hall.latitude ?? null);
    setLongitude(hall.longitude ?? null);
    setSelectedServices(hall.equipment ?? []);
    setProvidesHospitality(!!hall.providesHospitality);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setDialogOpen(true);
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: getListHallsQueryKey() });

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast({ variant: "destructive", title: "حجم الصورة كبير جداً", description: "الحد الأقصى 4 ميجابايت" });
      return;
    }
    setImageUploading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImagePreview(ev.target?.result as string);
      setImageUploading(false);
    };
    reader.onerror = () => {
      setImageUploading(false);
      toast({ variant: "destructive", title: "فشل تحميل الصورة" });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClearLocation = () => {
    setLatitude(null);
    setLongitude(null);
  };

  const onSubmit = async (values: HallForm) => {
    try {
      const payload: Record<string, unknown> = {
        ...values,
        capacity: Number(values.capacity),
        images: imagePreview ? [imagePreview] : [],
        equipment: selectedServices,
        providesHospitality,
      };
      if (latitude != null && longitude != null) {
        payload.latitude = latitude;
        payload.longitude = longitude;
      }
      if (editingHall) {
        await updateHall.mutateAsync({ id: editingHall.id, data: payload as any });
        toast({ title: "تم تعديل القاعة بنجاح" });
      } else {
        await createHall.mutateAsync({ data: payload as any });
        toast({ title: "تم إضافة القاعة بنجاح" });
      }
      setDialogOpen(false);
      invalidate();
    } catch (e: any) {
      toast({ variant: "destructive", title: "خطأ", description: e?.data?.error ?? "فشلت العملية" });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteHall.mutateAsync({ id: deleteTarget.id });
      toast({ title: "تم حذف القاعة" });
      setDeleteTarget(null);
      invalidate();
    } catch (e: any) {
      toast({ variant: "destructive", title: "فشل الحذف", description: e?.data?.error ?? "" });
    }
  };

  return (
    <>
      <div className="space-y-5">
        <PageHeader
          icon={Presentation}
          title="إدارة القاعات"
          description="إضافة القاعات وتعديلها، وشاشة العرض ومحتويات كل قاعة"
          actions={<Button onClick={openAdd}><Plus className="w-4 h-4" />إضافة قاعة</Button>}
        />

        {isLoading ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array(6).fill(0).map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <Skeleton className="h-44 w-full" />
                <div className="p-4 space-y-2">
                  <Skeleton className="h-5 w-2/3" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              </Card>
            ))}
          </div>
        ) : !halls?.length ? (
          <div className="text-center py-16 bg-card rounded-xl">
            <Building2 className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">لا توجد قاعات. أضف قاعة للبدء</p>
            <Button onClick={openAdd} className="mt-4 gap-2 bg-primary">
              <Plus className="w-4 h-4" />
              إضافة أول قاعة
            </Button>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {halls.map(hall => (
              <Card key={hall.id} className="overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                <div className="h-44 bg-gradient-to-br from-primary to-primary/80 relative">
                  {hall.images && hall.images.length > 0 ? (
                    <img src={hall.images[0].url} alt={hall.nameAr || hall.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Building2 className="w-12 h-12 text-white/20" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                  <div className="absolute top-3 left-3">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${STATUS_COLOR[hall.status] ?? "bg-muted text-foreground"}`}>
                      {STATUS_AR[hall.status] ?? hall.status}
                    </span>
                  </div>
                  {hall.averageRating ? (
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setRatingHall(hall); }}
                      className="absolute bottom-3 right-3 bg-card/ backdrop-blur px-2 py-0.5 rounded-full flex items-center gap-1 text-xs font-semibold hover:bg-card transition-colors"
                    >
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      {Number(hall.averageRating).toFixed(1)}
                    </button>
                  ) : null}
                </div>

                <CardContent className="p-4 flex-1 flex flex-col">
                  <div className="flex items-start justify-between mb-1">
                    <h3 className="font-bold text-foreground text-base leading-tight">{hall.nameAr || hall.name}</h3>
                    <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">{hall.referenceCode}</span>
                  </div>

                  <div className="flex items-center gap-1 text-muted-foreground text-xs mb-3">
                    <MapPin className="w-3 h-3" />
                    {hall.locationAr || hall.location}
                  </div>

                  <div className="flex items-center gap-3 text-sm text-muted-foreground mb-3">
                    <div className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-primary" />
                      {hall.capacity} شخص
                    </div>
                    {hall.floor && <span className="text-muted-foreground/50">•</span>}
                    {hall.floor && <span>الطابق {hall.floor}</span>}
                  </div>

                  <div className="flex flex-wrap gap-1 mb-4">
                    {(hall as any).equipment?.slice(0, 2).map((eq: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs">{eq}</Badge>
                    ))}
                    {(hall as any).equipment?.length > 2 && (
                      <Badge variant="secondary" className="text-xs">+{(hall as any).equipment.length - 2}</Badge>
                    )}
                    {(hall as any).providesHospitality && (
                      <Badge className="text-xs bg-amber-100 text-amber-700 hover:bg-amber-100 gap-1">
                        <UtensilsCrossed className="w-3 h-3" /> ضيافة
                      </Badge>
                    )}
                  </div>

                  <div className="mt-auto flex gap-2 pt-3 border-t">
                    <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => openEdit(hall)}>
                      <Pencil className="w-3.5 h-3.5" />
                      تعديل
                    </Button>
                    {(hall as any).qrCode ? (
                      <Button size="icon" variant="ghost" className="w-8 h-8 text-muted-foreground hover:text-primary hover:bg-muted" onClick={() => setQrTarget(hall)}>
                        <QrCode className="w-3.5 h-3.5" />
                      </Button>
                    ) : null}
                    <Button size="icon" variant="ghost" className="w-8 h-8 text-muted-foreground hover:text-primary hover:bg-muted" title="شاشة باب القاعة" onClick={() => window.open(`/display/hall/${hall.id}`, "_blank")}>
                      <MonitorPlay className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="w-8 h-8 text-muted-foreground hover:text-primary hover:bg-muted" title="محتويات القاعة" asChild>
                      <Link href="/manager/assets"><Armchair className="w-3.5 h-3.5" /></Link>
                    </Button>
                    <Button size="icon" variant="ghost" className="w-8 h-8 text-red-400 hover:text-red-600 hover:bg-red-50" title="حذف" onClick={() => setDeleteTarget(hall)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingHall ? "تعديل القاعة" : "إضافة قاعة جديدة"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>الاسم (عربي) <span className="text-red-500">*</span></Label>
                <Input {...register("nameAr", { required: true })} placeholder="قاعة الاجتماعات الرئيسية" />
                {errors.nameAr && <p className="text-xs text-red-500">مطلوب</p>}
              </div>
              <div className="space-y-1.5">
                <Label>الاسم (إنجليزي)</Label>
                <Input {...register("name")} placeholder="Main Conference Room" dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label>الموقع (عربي) <span className="text-red-500">*</span></Label>
                <Input {...register("locationAr", { required: true })} placeholder="المبنى الرئيسي" />
                {errors.locationAr && <p className="text-xs text-red-500">مطلوب</p>}
              </div>
              <div className="space-y-1.5">
                <Label>الموقع (إنجليزي)</Label>
                <Input {...register("location")} placeholder="Main Building" dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label>السعة (أشخاص) <span className="text-red-500">*</span></Label>
                <Input type="number" min={1} {...register("capacity", { required: true })} dir="ltr" />
              </div>
              <div className="space-y-1.5">
                <Label>الحالة</Label>
                <Controller name="status" control={control} render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="available">متاحة</SelectItem>
                      <SelectItem value="unavailable">غير متاحة</SelectItem>
                      <SelectItem value="maintenance">صيانة</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5">
                <Label>الطابق</Label>
                <Input {...register("floor")} placeholder="الأول" />
              </div>
              <div className="space-y-1.5">
                <Label>المبنى</Label>
                <Input {...register("building")} placeholder="المبنى أ" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>الوصف (عربي)</Label>
              <Textarea {...register("descriptionAr")} placeholder="وصف القاعة ومميزاتها..." rows={3} />
            </div>

            {/* Official services */}
            <div className="space-y-2">
              <Label>الخدمات المتوفرة في القاعة</Label>
              <div className="grid grid-cols-2 gap-2 border rounded-lg p-3 bg-muted/40">
                {HALL_SERVICES.map(service => (
                  <label key={service.value} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={selectedServices.includes(service.value)}
                      onCheckedChange={() => toggleService(service.value)}
                    />
                    {service.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Hospitality */}
            <label className={`flex items-start gap-3 border rounded-lg p-3 cursor-pointer ${providesHospitality ? "border-primary/40 bg-primary/[0.04]" : "bg-muted/40"}`}>
              <Checkbox checked={providesHospitality} onCheckedChange={(v) => setProvidesHospitality(v === true)} className="mt-0.5" />
              <UtensilsCrossed className="w-4 h-4 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">توفر القاعة خدمات الضيافة</p>
                <p className="text-xs text-muted-foreground">يسمح للجهة الطالبة بطلب الضيافة أو وجبة طعام عند الحجز</p>
              </div>
            </label>

            {/* Image upload */}
            <div className="space-y-1.5">
              <Label>صورة القاعة (اختياري)</Label>
              {imagePreview ? (
                <div className="relative rounded-lg overflow-hidden border h-40">
                  <img src={imagePreview} alt="معاينة القاعة" className="w-full h-full object-cover" />
                  <Button
                    type="button" size="icon" variant="secondary"
                    className="absolute top-2 left-2 w-7 h-7 bg-card/ hover:bg-card"
                    onClick={handleRemoveImage}
                  >
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-28 rounded-lg border-2 border-dashed border-border flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:border-input hover:text-muted-foreground transition-colors"
                  disabled={imageUploading}
                >
                  <Upload className="w-5 h-5" />
                  <span className="text-xs">{imageUploading ? "جاري الرفع..." : "اضغط لرفع صورة من الحاسوب"}</span>
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
            </div>

            {/* Location map */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>موقع القاعة على الخريطة (اختياري)</Label>
                {latitude != null && (
                  <button type="button" onClick={handleClearLocation} className="text-xs text-red-500 hover:underline">
                    إزالة الموقع
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">اضغط على الخريطة لتحديد موقع القاعة، سيتم توليد رمز QR للوصول تلقائياً عند الحفظ</p>
              <HallLocationMap
                mapKey={editingHall ? `hall-${editingHall.id}` : "new-hall"}
                latitude={latitude}
                longitude={longitude}
                onChange={(lat, lng) => { setLatitude(lat); setLongitude(lng); }}
              />
              {latitude != null && longitude != null && (
                <p className="text-xs text-muted-foreground font-mono text-right" dir="ltr">{latitude.toFixed(5)}, {longitude.toFixed(5)}</p>
              )}
            </div>

            <DialogFooter className="gap-2 flex-row-reverse sm:justify-start">
              <Button type="submit" disabled={isSubmitting} className="bg-primary hover:bg-primary/90">
                {isSubmitting ? "جاري الحفظ..." : editingHall ? "حفظ التعديلات" : "إضافة القاعة"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* QR Code Dialog */}
      <Dialog open={!!qrTarget} onOpenChange={v => !v && setQrTarget(null)}>
        <DialogContent className="sm:max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>رمز QR لموقع {qrTarget?.nameAr || qrTarget?.name}</DialogTitle>
          </DialogHeader>
          {qrTarget?.qrCode ? (
            <div className="flex flex-col items-center gap-4 py-2">
              <img src={qrTarget.qrCode} alt="QR Code" className="w-56 h-56 rounded-lg border" />
              <p className="text-xs text-muted-foreground text-center">
                امسح هذا الرمز للحصول على خريطة الوصول إلى القاعة
              </p>
              <a
                href={qrTarget.qrCode}
                download={`hall-${qrTarget.id}-qrcode.png`}
                className="inline-flex items-center gap-2 text-sm text-primary font-medium hover:underline"
              >
                <Download className="w-4 h-4" />
                تحميل الرمز
              </a>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف القاعة</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف قاعة <strong>{deleteTarget?.nameAr || deleteTarget?.name}</strong>؟ لا يمكن التراجع.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={handleDelete}>حذف القاعة</AlertDialogAction>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <HallRatingDialog hall={ratingHall} onClose={() => setRatingHall(null)} />
    </>
  );
}
