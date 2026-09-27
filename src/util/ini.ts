export type IniSection = Record<string, string>;

/** Parse an INI file into lower-cased sections and keys. */
export function parseIni(text: string): Record<string, IniSection> {
  const out: Record<string, IniSection> = {};
  let section: IniSection = (out[''] = {});
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(';') || line.startsWith('#') || line.startsWith('//')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      section = out[line.slice(1, -1).trim().toLowerCase()] ??= {};
      continue;
    }
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    section[line.slice(0, eq).trim().toLowerCase()] = line.slice(eq + 1).trim();
  }
  return out;
}

/** song.ini files use a [song] section, but some omit the header entirely. */
export function songSection(ini: Record<string, IniSection>): IniSection {
  return { ...ini[''], ...ini['song'] };
}

export function iniNumber(sec: IniSection, key: string): number | undefined {
  const v = sec[key];
  if (v === undefined || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function iniBool(sec: IniSection, key: string): boolean | undefined {
  const v = sec[key]?.toLowerCase();
  if (v === undefined || v === '') return undefined;
  return v === 'true' || v === '1';
}
