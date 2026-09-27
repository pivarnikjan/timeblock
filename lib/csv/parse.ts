/**
 * A small RFC 4180 CSV reader: quoted fields, doubled quotes, commas and line
 * breaks inside quotes, CRLF or LF line endings, and a leading UTF-8 BOM.
 *
 * The delimiter is detected rather than assumed: Excel with Slovak (and most
 * European) regional settings saves "CSV" with semicolons.
 */

export type Delimiter = ',' | ';' | '\t';

export interface CsvRow {
  /** 1-based physical line the record starts on — what an error message should point at. */
  line: number;
  values: string[];
}

const stripBom = (text: string) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

/** Picks the delimiter that occurs most often, outside quotes, on the header line. */
export function detectDelimiter(text: string): Delimiter {
  const counts: Record<Delimiter, number> = { ',': 0, ';': 0, '\t': 0 };
  let quoted = false;
  for (const ch of stripBom(text)) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\n' || ch === '\r')) break;
    else if (!quoted && ch in counts) counts[ch as Delimiter] += 1;
  }
  const [best, count] = (Object.entries(counts) as [Delimiter, number][]).sort((a, b) => b[1] - a[1])[0];
  return count > 0 ? best : ',';
}

export function parseCsv(input: string, delimiter: Delimiter = detectDelimiter(input)): CsvRow[] {
  const text = stripBom(input);
  const rows: CsvRow[] = [];

  let values: string[] = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  let fieldTouched = false;

  const endField = () => {
    values.push(field);
    field = '';
    fieldTouched = false;
  };
  const endRow = () => {
    endField();
    // Blank lines (a single empty field) are skipped rather than reported as rows.
    if (!(values.length === 1 && values[0].trim() === '')) rows.push({ line: rowLine, values });
    values = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }

    if (ch === '"' && !fieldTouched) {
      quoted = true;
      fieldTouched = true;
    } else if (ch === delimiter) {
      endField();
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
      line++;
      rowLine = line;
    } else {
      field += ch;
      fieldTouched = true;
    }
  }
  if (field !== '' || values.length > 0) endRow();

  return rows;
}

export interface CsvTable {
  headers: string[];
  rows: { line: number; get: (header: string) => string }[];
}

/** Header-keyed access, case- and whitespace-insensitive ("Due Date" = "due_date"). */
export function readTable(text: string): CsvTable {
  const [head, ...body] = parseCsv(text);
  if (!head) return { headers: [], rows: [] };

  const normalise = (h: string) => h.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const headers = head.values.map(normalise);

  return {
    headers,
    rows: body.map((row) => ({
      line: row.line,
      get: (header: string) => {
        const index = headers.indexOf(normalise(header));
        return index === -1 ? '' : (row.values[index] ?? '').trim();
      },
    })),
  };
}
