import type { SectionId } from '@/lib/sections';

// Simple line pictograms for section entries; decorative, the link text carries the meaning.
const paths: Partial<Record<SectionId, string>> = {
  history: 'M6 4h9l3 3v13H6z M15 4v3h3 M9 11h6 M9 14h6 M9 17h4',
  calendar: 'M5 6h14v14H5z M5 10h14 M9 4v4 M15 4v4 M8 13h2 M11 13h2 M14 13h2 M8 16h2 M11 16h2',
  directories: 'M5 5h5v14H5z M10 5h4v14h-4 M14 6l4-1 2 13-4 1z',
  branches: 'M12 21s-6-5.5-6-11a6 6 0 0 1 12 0c0 5.5-6 11-6 11z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  services: 'M4 20h16 M6 20V10 M10 20V10 M14 20V10 M18 20V10 M3 10l9-6 9 6z',
  compliance: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z M9 12l2 2 4-4',
};

export function SectionIcon({ id }: { id: SectionId }) {
  const d = paths[id];
  if (!d) return null;
  return <svg className="section-icon" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false"><path d={d} /></svg>;
}
