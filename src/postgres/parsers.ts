export interface Parsers {
  getTypeParser(oid: number, format?: string): unknown
}

// Drivers parse dates and timestamps themselves, reading those without a zone
// as local time. These stay text so the columns parse them:
// date, timestamp, timestamptz, interval, their arrays and numeric[].
const text = new Set([1082, 1114, 1184, 1186, 1182, 1115, 1185, 1187, 1231])

function raw(value: string): string {
  return value
}

export function textParsers(fallback: Parsers): Parsers {
  return {
    getTypeParser(oid, format) {
      return text.has(oid) ? raw : fallback.getTypeParser(oid, format)
    }
  }
}
