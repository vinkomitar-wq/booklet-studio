/**
 * Prelamanje teksta u retke za crtanje na platnu (čisto: mjerenje se predaje izvana, pa se pravilo ispituje bez preglednika).
 * Tajlandski nema razmaka među riječima — dijeli se preko Intl.Segmenter kad ga preglednik ima, inače po znakovima.
 */
export type Measure = (s: string) => number;

export interface WrapOpts {
  maxLines?: number;
  /** Zamjena za Intl.Segmenter (testovi). */
  segment?: (s: string) => string[];
}

export function defaultSegment(s: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment: (x: string) => Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) {
    try {
      return Array.from(new Seg(undefined, { granularity: 'word' }).segment(s), (x) => x.segment);
    } catch {
      /* preglednik bez podrške za granularnost: pada na razdvajanje po razmacima */
    }
  }
  return s.split(/(\s+)/).filter((x) => x !== '');
}

const clip = (measure: Measure, s: string, max: number): string => {
  let out = s;
  while (out.length > 1 && measure(`${out}…`) > max) out = out.slice(0, -1);
  return `${out.trimEnd()}…`;
};

/** Retci teksta koji stanu u `maxWidth`. Prazni retci (odlomci) se čuvaju kao ''. Preduga riječ se lomi po znakovima; višak iznad `maxLines` završava s „…". */
export function wrapText(measure: Measure, text: string, maxWidth: number, opts: WrapOpts = {}): string[] {
  const segment = opts.segment ?? defaultSegment;
  const lines: string[] = [];
  for (const para of String(text ?? '').split(/\r?\n/)) {
    if (para.trim() === '') {
      lines.push('');
      continue;
    }
    let line = '';
    const flush = () => {
      if (line.trim() !== '') lines.push(line.trimEnd());
      line = '';
    };
    for (const tok of segment(para)) {
      if (measure(line + tok) <= maxWidth) {
        line += tok;
        continue;
      }
      flush();
      const piece = tok.replace(/^\s+/, '');
      if (measure(piece) <= maxWidth) {
        line = piece;
        continue;
      }
      // jedna riječ šira od retka: lomi se po znakovima
      for (const ch of Array.from(piece)) {
        if (measure(line + ch) > maxWidth && line !== '') flush();
        line += ch;
      }
    }
    flush();
  }
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  const max = opts.maxLines;
  if (max !== undefined && lines.length > max) {
    const kept = lines.slice(0, max);
    kept[max - 1] = clip(measure, kept[max - 1] === '' ? '…' : kept[max - 1], maxWidth);
    return kept;
  }
  return lines;
}
