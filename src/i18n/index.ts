import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import fr from "./locales/fr.json";

/** The languages of the webapp: French for a French browser, English otherwise, as oc3. */
export const LANGUAGES = ["en", "fr"] as const;
export type Language = (typeof LANGUAGES)[number];

export function browserLanguage(language: string | undefined): Language {
  return language?.toLowerCase().startsWith("fr") ? "fr" : "en";
}

// Every visible string goes through t(). No hard-coded string in the components.
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, fr: { translation: fr } },
  lng: browserLanguage(typeof navigator === "undefined" ? undefined : navigator.language),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

// The page language follows, for screen readers, hyphenation and the spell checker.
if (typeof document !== "undefined") document.documentElement.lang = i18n.language;

export default i18n;
