/** Mirrors api-server/src/lib/options.ts (PlatformOptions). */
export interface PlatformOptions {
  identity: {
    systemNameAr: string;
    systemNameEn: string;
    shortNameAr: string;
    organizationAr: string;
    parentOrganizationAr: string;
    taglineAr: string;
    loginWelcomeAr: string;
    loginNoticeAr: string;
    loginBackground: string | null;
    supportPhone: string;
    supportEmail: string;
  };
  appearance: {
    theme: string;
    font: string;
    sidebarStyle: string;
    darkByDefault: boolean;
    allowUserCustomization: boolean;
    radius: "sharp" | "normal" | "round";
  };
  booking: {
    weekendDays: number[];
    blockWeekends: boolean;
    minAdvanceHours: number;
    maxAdvanceDays: number;
    maxDurationHours: number;
    slotStepMinutes: number;
    allowRecurring: boolean;
    maxRecurringWeeks: number;
    requireCoordinator: boolean;
    requireAttendees: boolean;
    cateringLeadHours: number;
    seatingLayouts: string[];
    activityTypes: string[];
  };
  notifications: {
    reminderEnabled: boolean;
    reminderHoursBefore: number;
    remindManagersForPreparation: boolean;
    notifyAffectedOnMaintenance: boolean;
  };
  maintenance: {
    urgentBlocksHall: boolean;
    highBlocksHall: boolean;
    affectedWindowDays: number;
  };
  display: {
    showDepartment: boolean;
    showActivity: boolean;
    refreshSeconds: number;
    tickerAr: string;
    theme: "midnight" | "brand" | "light";
    subtitleAr: string;
    showStats: boolean;
    showTimeline: boolean;
    showNext: boolean;
    hallsPerPage: number;
    pageSeconds: number;
    tickerEnabled: boolean;
    tickerItems: string[];
    tickerMode: "scroll" | "static";
    tickerSpeed: "slow" | "normal" | "fast";
    tickerStaticSeconds: number;
    tickerShowLogo: boolean;
    tickerLabel: string;
    tickerTextColor: string;
    tickerBgColor: string;
    tickerLabelColor: string;
    tickerSize: "md" | "lg" | "xl";
  };
  print: {
    headerLine1: string;
    headerLine2: string;
    headerLine3: string;
    signatureTitle: string;
    footerNote: string;
    showQr: boolean;
  };
}

export type PublicOptions = Pick<PlatformOptions, "identity" | "appearance" | "display" | "print"> & {
  booking: Omit<PlatformOptions["booking"], never>;
};

export const WEEKDAYS_AR = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];
