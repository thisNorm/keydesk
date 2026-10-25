import { initReactI18next } from "react-i18next";
import i18n from "i18next";

import english from "../public/locales/en/translations.json";
import korean from "../public/locales/ko/translations.json";

i18n.use(initReactI18next).init({
  resources: {
    en: { translations: english },
    ko: { translations: korean }
  },
  lng: "ko",
  fallbackLng: "en",
  supportedLngs: ["ko", "en"],
  ns: ["translations"],
  defaultNS: "translations",
  interpolation: {
    escapeValue: false
  }
});

export default i18n;
