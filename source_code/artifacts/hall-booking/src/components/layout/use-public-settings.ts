import { useQuery } from "@tanstack/react-query";
import type { PublicOptions } from "@/lib/options";

export interface PublicSettings {
  companyName: string;
  companyNameAr: string | null;
  logoUrl: string | null;
  footerText: string | null;
  footerTextAr: string | null;
  workingHoursStart: string;
  workingHoursEnd: string;
  passwordMinLength: number;
  iconVersion: string;
  options: PublicOptions;
}

export const PUBLIC_SETTINGS_KEY = ["/api/public/settings"];

export function usePublicSettings() {
  return useQuery<PublicSettings>({
    queryKey: PUBLIC_SETTINGS_KEY,
    queryFn: async () => {
      const r = await fetch("/api/public/settings");
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}

/** Display name of the platform (identity settings first, then the legacy company name). */
export function systemNameOf(s?: PublicSettings | null): string {
  return s?.companyNameAr || s?.options?.identity?.systemNameAr || "منصة حجز القاعات";
}
