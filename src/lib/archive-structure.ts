export interface StructureEntry { title: string; details: string[] }
export interface ArchiveStructure { leadership: StructureEntry[]; departments: StructureEntry[] }

/** The source starts with a layout table, followed by its complete, readable contact directory.
 * Use that directory rather than guessing reporting lines from empty/merged Word cells. */
export function archiveStructure(body: string): ArchiveStructure | null {
  const lines = body.split('\n').map(line => line.trim());
  const start = lines.findIndex(line => /^Директор\s*[-–]\s*\S/u.test(line));
  if (start < 0) return null;
  const result: ArchiveStructure = { leadership: [], departments: [] };
  let department: StructureEntry | undefined;
  for (const line of lines.slice(start)) {
    if (!line) continue;
    if (/^Отдел\s.+:\s*$/u.test(line)) {
      const title = line.replace(/:\s*$/, '');
      department = result.departments.find(entry => entry.title === title);
      if (!department) { department = { title, details: [] }; result.departments.push(department); }
    } else if (/^(Директор|Заместитель директора|Главный хранитель фондов)\s*[-–:]/u.test(line)) {
      const match = line.match(/^(Директор|Заместитель директора|Главный хранитель фондов)\s*[-–:]\s*(.*)$/u)!;
      department = undefined;
      // An unfilled role in the original is not a second named employee.
      if (match[2]) result.leadership.push({ title: match[1], details: [match[2]] });
    } else if (department) department.details.push(line);
    else return null; // An edited source we do not recognise keeps its ordinary body renderer.
  }
  return result.leadership.length && result.departments.length ? result : null;
}
