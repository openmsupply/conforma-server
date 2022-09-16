// Utility functions to extend capabilities of expression evaluator via the
// "objectFunctions" operator

import { DateTime, Duration } from 'luxon'

const generateExpiry = (duration: Duration) => DateTime.now().plus(duration).toJSDate()

// getYear() => "2022"
// getYear("short") => "22"
const getYear = (type?: 'short'): string =>
  type === 'short' ? String(new Date().getFullYear()).slice(2) : String(new Date().getFullYear())

type FormatDate =
  | string
  | {
      format: string
      locale?: string
    }
// Returns ISO date string or JS Date as formatted Date (Luxon). Returns current
// date if date not supplied
const getFormattedDate = (formatString: FormatDate, date?: string | Date) => {
  const tempDate = date
    ? typeof date === 'string'
      ? DateTime.fromISO(date)
      : DateTime.fromJSDate(date)
    : DateTime.now()

  if (typeof formatString === 'string') return tempDate.toFormat(formatString)
  const { format, locale } = formatString
  return tempDate.setLocale(locale).toFormat(format)
}

// Returns JS Date object from ISO date string. Returns current timestamp if
// no parameter supplied
const getJSDate = (date?: string) => (date ? DateTime.fromISO(date).toJSDate() : new Date())

// Returns ISO date-time string from JS Date object. Returns current timestamp
// if no parameter supplied
const getISODate = (date?: Date) =>
  date ? DateTime.fromJSDate(date).toISO() : DateTime.now().toISO()

export default { generateExpiry, getYear, getFormattedDate, getJSDate, getISODate }
