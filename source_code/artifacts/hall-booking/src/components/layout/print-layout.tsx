import { useEffect, type ReactNode } from "react";
import { Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { systemNameOf, usePublicSettings } from "./use-public-settings";

/**
 * A4 printable document: organisation header (logo + header lines from the print settings), body, signature/footer.
 * The toolbar is hidden when printing; "Save as PDF" in the browser print dialog produces the PDF.
 */
export function PrintLayout({ title, subtitle, children, ready = true, orientation = "portrait" }: { title: string; subtitle?: ReactNode; children: ReactNode; ready?: boolean; orientation?: "portrait" | "landscape" }) {
  const { data: s } = usePublicSettings();
  const p = s?.options?.print;
  const id = s?.options?.identity;
  const lines = [p?.headerLine1, p?.headerLine2, p?.headerLine3].filter(Boolean);

  useEffect(() => {
    document.title = title;
    const style = document.createElement("style");
    style.textContent = `@page { size: A4 ${orientation}; margin: 12mm; }`;
    document.head.appendChild(style);
    return () => style.remove();
  }, [title, orientation]);

  return (
    <div className="min-h-svh bg-muted/50 print:bg-white" dir="rtl">
      <div className="print:hidden sticky top-0 z-10 bg-background/95 backdrop-blur border-b">
        <div className="max-w-[210mm] mx-auto flex items-center justify-between gap-2 px-4 py-2.5">
          <p className="text-sm font-semibold truncate">{title}</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => window.print()} disabled={!ready}><Printer className="w-4 h-4" />طباعة / حفظ PDF</Button>
            <Button size="sm" variant="outline" onClick={() => window.close()}><X className="w-4 h-4" />إغلاق</Button>
          </div>
        </div>
      </div>
      <div className={`mx-auto bg-white text-slate-900 shadow-sm print:shadow-none my-4 print:my-0 p-[12mm] print:p-0 ${orientation === "landscape" ? "max-w-[297mm]" : "max-w-[210mm]"}`}>
        <header className="flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-3 mb-5">
          <div className="text-sm leading-6 font-semibold min-w-0">
            {lines.length ? lines.map((l, i) => <p key={i}>{l}</p>) : <><p>{id?.parentOrganizationAr}</p><p>{id?.organizationAr}</p></>}
          </div>
          <div className="text-center shrink-0">
            {s?.logoUrl ? <img src={s.logoUrl} alt="" className="h-16 w-16 object-contain mx-auto" /> : <img src={`/icons/icon-192.png?v=${s?.iconVersion ?? ""}`} alt="" className="h-14 w-14 mx-auto" />}
          </div>
          <div className="text-sm leading-6 text-left min-w-0">
            <p className="font-bold">{systemNameOf(s)}</p>
            <p className="text-slate-500 tabular-nums">{new Date().toLocaleDateString("ar-IQ-u-nu-latn")}</p>
          </div>
        </header>
        <div className="text-center mb-5">
          <h1 className="text-xl font-bold">{title}</h1>
          {subtitle && <div className="text-sm text-slate-600 mt-1">{subtitle}</div>}
        </div>
        {children}
        {p?.footerNote && <footer className="mt-8 pt-3 border-t text-[11px] text-slate-500 text-center">{p.footerNote}</footer>}
      </div>
    </div>
  );
}

export function PrintTable({ head, rows, className }: { head: ReactNode[]; rows: ReactNode[][]; className?: string }) {
  return (
    <table className={`w-full border-collapse text-[12px] ${className ?? ""}`}>
      <thead>
        <tr>{head.map((h, i) => <th key={i} className="border border-slate-400 bg-slate-100 px-2 py-1.5 text-start font-bold">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="break-inside-avoid">{r.map((c, j) => <td key={j} className="border border-slate-300 px-2 py-1.5 align-top">{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}
