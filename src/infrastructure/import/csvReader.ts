export type CsvRow = Record<string, string>;

/** RFC4180-style CSV reader with BOM removal and automatic comma/semicolon detection. */
export function parseCsv(text: string): CsvRow[] {
  const firstLine=text.replace(/^\uFEFF/,'').split(/\r?\n/,1)[0]??'';
  const delimiter=(firstLine.match(/;/g)?.length??0)>(firstLine.match(/,/g)?.length??0)?';':',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.length === 0) quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(value => value.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (quoted) throw new Error('CSV содержит незакрытую кавычку. Проверьте файл.');
  if (cell.length || row.length) { row.push(cell); if (row.some(value => value.trim() !== '')) rows.push(row); }
  if (rows.length < 2) throw new Error('В CSV должны быть заголовки и хотя бы одна строка данных.');
  const headers = rows[0].map((header, index) => (index === 0 ? header.replace(/^\uFEFF/, '') : header).trim());
  if (headers.some(header => !header)) throw new Error('В CSV обнаружен пустой заголовок столбца.');
  if (new Set(headers).size !== headers.length) throw new Error('В CSV есть повторяющиеся названия столбцов.');
  return rows.slice(1).map((values, index) => {
    if (values.length !== headers.length) throw new Error(`Строка ${index + 2}: число значений не совпадает с числом столбцов.`);
    return Object.fromEntries(headers.map((header, column) => [header, values[column].trim()]));
  });
}
