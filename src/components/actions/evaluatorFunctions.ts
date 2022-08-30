// Utility functions to extend capabilities of expression evaluator via the
// "objectFunctions" operator

import { DateTime, Duration } from 'luxon'

const generateExpiry = (duration: Duration) => DateTime.now().plus(duration).toJSDate()

// getYear() => "2022"
// getYear("short") => "22"
const getYear = (type?: 'short'): string =>
  type === 'short' ? String(new Date().getFullYear()).slice(2) : String(new Date().getFullYear())

// Returns ISO date string or JS Date as formatted Date (Luxon). Returns current
// date if date not supplied
const getFormattedDate = (formatString: string, date?: string | Date) =>
  (date
    ? typeof date === 'string'
      ? DateTime.fromISO(date)
      : DateTime.fromJSDate(date)
    : DateTime.now()
  ).toFormat(formatString)

// Returns JS Date object from ISO date string. Returns current timestamp if
// no parameter supplied
const getJSDate = (date?: string) => (date ? DateTime.fromISO(date).toJSDate() : new Date())

export default { generateExpiry, getYear, getFormattedDate, getJSDate }
