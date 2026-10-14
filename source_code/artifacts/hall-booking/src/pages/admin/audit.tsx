import { useState } from "react";
import { MainLayout } from "@/components/layout/main-layout";
import { PageHeader } from "@/components/layout/page-header";
import { FileText as FileTextIcon } from "lucide-react";
import { useListAuditLogs } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { AUDIT_ACTIONS, actionLabel, actionTone, entityLabel } from "@/lib/audit-labels";

const PAGE_SIZE = 50;

export default function AdminAudit() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const params: Record<string, unknown> = { page, limit: PAGE_SIZE };
  if (action !== "all") params.action = action;
  if (from) params.from = `${from}T00:00:00`;
  if (to) params.to = `${to}T23:59:59`;
  const { data, isLoading, isFetching } = useListAuditLogs(params as any);
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <MainLayout>
      <div className="space-y-5">
        <PageHeader icon={FileTextIcon} title="سجل الأحداث" description="متابعة جميع العمليات والنشاطات في النظام لأغراض التدقيق والأمان" />

        <Card>
          <CardHeader className="pb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between space-y-0">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">الأحداث ({total})</CardTitle>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={action} onValueChange={(v) => { setAction(v); setPage(1); }}>
                <SelectTrigger className="w-52 h-9"><SelectValue placeholder="نوع الإجراء" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الإجراءات</SelectItem>
                  {Object.entries(AUDIT_ACTIONS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="date" className="w-40 h-9" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label="من تاريخ" />
              <span className="text-xs text-muted-foreground">إلى</span>
              <Input type="date" className="w-40 h-9" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label="إلى تاريخ" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>التاريخ والوقت</TableHead>
                    <TableHead>المستخدم</TableHead>
                    <TableHead>الإجراء</TableHead>
                    <TableHead>الكيان</TableHead>
                    <TableHead>التفاصيل</TableHead>
                    <TableHead>عنوان IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 6 }).map((__, j) => <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>)}
                      </TableRow>
                    ))
                  ) : !data?.data?.length ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">لا توجد سجلات مطابقة</TableCell>
                    </TableRow>
                  ) : (
                    data.data.map((log) => (
                      <TableRow key={log.id} className="hover:bg-muted/40">
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap text-right" dir="ltr">{formatDateTime(log.createdAt)}</TableCell>
                        <TableCell className="font-medium text-sm">{log.username ?? "—"}</TableCell>
                        <TableCell>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${actionTone(log.action)}`}>
                            {actionLabel(log.action)}
                          </span>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {entityLabel(log.entityType)}{log.entityId ? ` #${log.entityId}` : ""}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-xs truncate" title={log.details ?? ""}>{log.details ?? "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground font-mono text-right" dir="ltr">{log.ipAddress ?? "—"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
              <span>صفحة {page} من {pages}{isFetching ? " …" : ""}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronRight className="w-4 h-4" /> السابق
                </Button>
                <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
                  التالي <ChevronLeft className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
