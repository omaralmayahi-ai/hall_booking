import React, { createContext, useContext, useEffect, useState } from "react";

type Language = "ar" | "en";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

// Very basic dictionary for core layout elements.
const dictionary: Record<string, Record<Language, string>> = {
  "app.name": {
    ar: "منصة حجز القاعات",
    en: "Hall Booking Platform"
  },
  "nav.dashboard": {
    ar: "لوحة القيادة",
    en: "Dashboard"
  },
  "nav.users": {
    ar: "المستخدمين",
    en: "Users"
  },
  "nav.halls": {
    ar: "القاعات",
    en: "Halls"
  },
  "nav.bookings": {
    ar: "الحجوزات",
    en: "Bookings"
  },
  "nav.audit": {
    ar: "سجل التدقيق",
    en: "Audit Log"
  },
  "nav.notifications": {
    ar: "الإشعارات",
    en: "Notifications"
  },
  "nav.settings": {
    ar: "الإعدادات",
    en: "Settings"
  },
  "nav.logout": {
    ar: "تسجيل الخروج",
    en: "Logout"
  },
  "action.login": {
    ar: "تسجيل الدخول",
    en: "Login"
  },
  "form.username": {
    ar: "اسم المستخدم",
    en: "Username"
  },
  "form.password": {
    ar: "كلمة المرور",
    en: "Password"
  }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem("language");
    return (saved as Language) || "ar";
  });

  useEffect(() => {
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = language;
    localStorage.setItem("language", language);
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const t = (key: string) => {
    if (dictionary[key]) {
      return dictionary[key][language];
    }
    return key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}

// Alias for convenience
export function useTranslation() {
  const { t, language, setLanguage } = useLanguage();
  return { t, language, setLanguage, isRtl: language === "ar" };
}

export type { Language };
