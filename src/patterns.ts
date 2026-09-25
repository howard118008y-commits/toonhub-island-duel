import type { CharacterPattern } from './characters';

const MOTIFS: Record<CharacterPattern, string> = {
  coffee: '<path d="M7 10h16v10a7 7 0 0 1-14 0V10Zm16 2h3a4 4 0 0 1 0 8h-3M6 29h21M12 4v3m6-3v3"/>',
  sparkle: '<path d="m17 3 3 10 10 4-10 3-3 10-4-10-10-3 10-4 4-10Z"/>',
  route: '<path d="M6 28V8h11v17h11V5"/><circle cx="6" cy="28" r="3"/><circle cx="28" cy="5" r="3"/>',
  breakfast: '<path d="M7 13V8c0-5 20-5 20 0v5l-3 2v14H10V15l-3-2ZM12 20h10m-10 5h10"/>',
  rain: '<path d="M5 13a7 7 0 0 1 12-5 6 6 0 1 1 10 7H7M9 22l-3 5m12-5-3 5m12-5-3 5"/>',
  transit: '<rect x="7" y="5" width="20" height="23" rx="4"/><path d="M8 17h18M12 28l-3 4m13-4 3 4M13 10h8"/><circle cx="12" cy="23" r="1"/><circle cx="22" cy="23" r="1"/>',
  chip: '<rect x="8" y="8" width="18" height="18" rx="2"/><rect x="13" y="13" width="8" height="8"/><path d="M12 3v5m10-5v5M12 26v5m10-5v5M3 12h5m-5 10h5m18-10h5m-5 10h5"/>',
  family: '<path d="M7 12h21l-4 13H11L5 5H2m9 8 7-8 7 8"/><circle cx="13" cy="30" r="2"/><circle cx="24" cy="30" r="2"/>',
  border: '<rect x="7" y="4" width="20" height="27" rx="2"/><circle cx="17" cy="15" r="6"/><path d="M11 25h12M11 15h12m-6-6v12"/>',
  shield: '<path d="m17 3 12 5v10c0 8-12 13-12 13S5 26 5 18V8l12-5Z"/><path d="m17 10 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z"/>',
  craft: '<path d="m5 9 8-5 9 11-8 5L5 9Zm12 8 11 14m-18-4h8"/>',
  tea: '<path d="M8 17c0-8 18-8 18 0v5c0 9-18 9-18 0v-5Zm1 1-7-7m24 6c10-10 10 12 0 5M11 10h12M17 4v6"/>',
  puppet: '<circle cx="17" cy="9" r="6"/><path d="m13 15-9 6 6 4 2-2-2 9h14l-2-9 2 2 6-4-9-6M7 4l5 3m10 0 5-3"/>',
  rice: '<path d="M4 18h26c-1 17-24 17-26 0Zm4-4c0-9 18-9 18 0M11 10l2 2m4-3v3m4-2 2 2M11 30h12"/>',
  cloud: '<path d="M6 23a7 7 0 0 1-1-14 8 8 0 0 1 15-2 8 8 0 1 1 6 16H6Zm-1 6h24"/>',
  sugar: '<path d="m17 3 12 8v14l-12 7-12-7V11L17 3Zm0 15 12-7M17 18 5 11m12 7v14M11 7l12 8"/>',
  port: '<path d="M17 10v21M5 18H1c0 17 32 17 32 0h-4M8 15h18"/><circle cx="17" cy="6" r="4"/>',
  sun: '<circle cx="17" cy="17" r="7"/><path d="M17 1v6m0 20v6M1 17h6m20 0h6M5 5l4 4m16 16 4 4M5 29l4-4M25 9l4-4"/>',
  leaf: '<path d="M28 4C8 2 1 17 9 25S34 20 28 4ZM7 30 24 10M12 24l-1-10m6 5 10-1"/>',
  ticket: '<path d="M4 9h26v5a4 4 0 0 0 0 8v5H4v-5a4 4 0 0 0 0-8V9ZM23 10v3m0 4v3m0 4v2M9 13h8m-8 5h8m-8 5h5"/>',
  wave: '<path d="M2 12c6-9 10 9 16 0s10 9 16 0M2 21c6-9 10 9 16 0s10 9 16 0M8 30h18"/>',
  sail: '<path d="M17 2v25M17 5 4 21h13m3-13 10 13H20M3 27h28l-6 6H9l-6-6Z"/>',
  jar: '<path d="M11 4h12v5c0 4 6 6 6 14 0 12-24 12-24 0 0-8 6-10 6-14V4ZM9 10h16M10 19h14v8H10z"/>',
  lighthouse: '<path d="M13 11h8l5 21H8l5-21ZM11 11V5h12v6M9 5l8-4 8 4M11 21h12M4 7H0m30 0h4M5 2 1 0m28 2 4-2"/>',
};

export function patternImage(pattern: CharacterPattern, color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160"><g transform="translate(27 25) rotate(-13 17 17)" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${MOTIFS[pattern]}</g><circle cx="113" cy="110" r="2" fill="${color}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
