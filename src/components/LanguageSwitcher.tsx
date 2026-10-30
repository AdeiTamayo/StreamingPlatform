import { useTranslation } from "react-i18next";
import FilterDropdown from "./FilterDropdown";
import {
  APP_LANGUAGES,
  setAppLanguage,
  type AppLanguage,
} from "../i18n";

/**
 * Language picker available to every visitor (signed in or not). Reuses the
 * shared FilterDropdown so the flag icons and keyboard handling match the
 * language control in Settings.
 */
export default function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const current = (i18n.resolvedLanguage || i18n.language || "en")
    .split("-")[0]
    .toLowerCase();

  return (
    <FilterDropdown
      className={`language-switcher ${className}`.trim()}
      value={current}
      options={APP_LANGUAGES.map((language) => ({
        value: language.code,
        label: language.label,
        icon: language.flag,
      }))}
      placeholder={t("nav.language")}
      onSelect={(value) => setAppLanguage(value as AppLanguage)}
    />
  );
}
