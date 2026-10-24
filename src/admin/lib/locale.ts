import { useTranslation } from "react-i18next"

// The pager's words, from the dashboard's own translations, as its tables use them.
export const usePaginationTranslations = () => {
  const { t } = useTranslation()

  return {
    of: t("general.of"),
    results: t("general.results"),
    pages: t("general.pages"),
    prev: t("general.prev"),
    next: t("general.next"),
  }
}

// A calendar day such as "2026-12-31", shown as that same day in the admin's language.
export const formatDay = (day: string, language: string) =>
  new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${day}T00:00:00Z`)
  )

// An instant, shown as its day where the admin is.
export const formatDate = (instant: string, language: string) =>
  new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(new Date(instant))
