import type { Energy } from '@/lib/db/schema';

/**
 * Google Calendar's colours, as its web app shows them.
 *
 * The Calendar API still reports colours from Google's *old* pastel palette
 * (events: colors.get; calendars: calendarList.backgroundColor), while the web
 * app renders the modern palette below. Mapping to the modern values is what
 * makes TimeBlock look like the Google Calendar you know.
 */

/** Event colours by `colorId`, as named in Google Calendar's colour picker. */
export const EVENT_COLORS: Record<string, { name: string; hex: string }> = {
  '1': { name: 'Lavender', hex: '#7986CB' },
  '2': { name: 'Sage', hex: '#33B679' },
  '3': { name: 'Grape', hex: '#8E24AA' },
  '4': { name: 'Flamingo', hex: '#E67C73' },
  '5': { name: 'Banana', hex: '#F6BF26' },
  '6': { name: 'Tangerine', hex: '#F4511E' },
  '7': { name: 'Peacock', hex: '#039BE5' },
  '8': { name: 'Graphite', hex: '#616161' },
  '9': { name: 'Blueberry', hex: '#3F51B5' },
  '10': { name: 'Basil', hex: '#0B8043' },
  '11': { name: 'Tomato', hex: '#D50000' },
};

/** Calendar colours: the API's legacy background → the web app's modern colour. */
const CALENDAR_COLORS: Record<string, string> = {
  '#ac725e': '#795548', // Cocoa
  '#d06b64': '#E67C73', // Flamingo
  '#f83a22': '#D50000', // Tomato
  '#fa573c': '#F4511E', // Tangerine
  '#ff7537': '#EF6C00', // Pumpkin
  '#ffad46': '#F09300', // Mango
  '#42d692': '#009688', // Eucalyptus
  '#16a765': '#0B8043', // Basil
  '#7bd148': '#7CB342', // Pistachio
  '#b3dc6c': '#C0CA33', // Avocado
  '#fbe983': '#E4C441', // Citron
  '#fad165': '#F6BF26', // Banana
  '#92e1c0': '#33B679', // Sage
  '#9fe1e7': '#039BE5', // Peacock
  '#9fc6e7': '#4285F4', // Cobalt
  '#4986e7': '#3F51B5', // Blueberry
  '#9a9cff': '#7986CB', // Lavender
  '#b99aff': '#B39DDB', // Wisteria
  '#c2c2c2': '#616161', // Graphite
  '#cabdbf': '#A79B8E', // Birch
  '#cca6ac': '#AD1457', // Radicchio
  '#f691b2': '#D81B60', // Cherry Blossom
  '#cd74e6': '#8E24AA', // Grape
  '#a47ae2': '#9E69AF', // Amethyst
};

/** Google's default when a calendar reports no colour (Peacock). */
const DEFAULT_CALENDAR = '#039BE5';

/** A calendar's colour as shown in Google Calendar. Custom colours pass through unchanged. */
export function calendarColor(background: string | null | undefined): string {
  if (!background) return DEFAULT_CALENDAR;
  return CALENDAR_COLORS[background.toLowerCase()] ?? background;
}

/** An event's colour: its own colour if it has one, else its calendar's — exactly Google's rule. */
export function eventColor(colorId: string | null | undefined, calendarBackground: string | null | undefined): string {
  return (colorId && EVENT_COLORS[colorId]?.hex) || calendarColor(calendarBackground);
}

/**
 * Colours by energy, for blocks with no window (Anytime) — and what blocks were
 * given in Google before they took their window's colour.
 */
export const ENERGY_COLOR_ID: Record<Energy, string> = {
  deep: '9', // Blueberry
  shallow: '7', // Peacock
  admin: '5', // Banana
};

export function energyColor(energy: Energy): string {
  return EVENT_COLORS[ENERGY_COLOR_ID[energy]].hex;
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/**
 * The Google event colour closest to `hex`. Google only takes its own eleven
 * event colours, so a committed block gets the nearest one to its window's.
 */
export function nearestEventColorId(hex: string): string {
  if (!HEX.test(hex)) return ENERGY_COLOR_ID.deep;
  const [r, g, b] = rgb(hex);
  let best = ENERGY_COLOR_ID.deep;
  let bestDistance = Infinity;
  for (const [id, { hex: candidate }] of Object.entries(EVENT_COLORS)) {
    const [cr, cg, cb] = rgb(candidate);
    // Weighted RGB distance: close enough to how the eye ranks colours for picking from eleven.
    const distance = 2 * (r - cr) ** 2 + 4 * (g - cg) ** 2 + 3 * (b - cb) ** 2;
    if (distance < bestDistance) [best, bestDistance] = [id, distance];
  }
  return best;
}

/**
 * The Google colour a block's event should have — the same rule as on
 * TimeBlock's calendar: its window's colour (the nearest Google has), else, for
 * work with no window, its energy's.
 */
export function blockColorId(windowHex: string | null | undefined, energy: Energy): string {
  return windowHex ? nearestEventColorId(windowHex) : ENERGY_COLOR_ID[energy];
}

/** A committed block's Google event, as far as colour goes. */
export interface BlockEventColor {
  /** The colour the event has in Google now. */
  colorId: string | null;
  /** The colour TimeBlock gave it when committing it; null for events committed before it recorded one. */
  plannedColorId: string | null;
}

const LEGACY_BLOCK_COLOR_IDS = new Set(Object.values(ENERGY_COLOR_ID));

/**
 * The colour someone chose for a block's event in Google Calendar, or null when
 * it still has the one TimeBlock gave it. Events committed before TimeBlock
 * recorded its colour carry an energy colour; any other colour on them was
 * chosen by hand.
 */
export function explicitColorId(event: BlockEventColor | null | undefined): string | null {
  const id = event?.colorId;
  if (!id || !EVENT_COLORS[id]) return null;
  if (event.plannedColorId !== null) return id === event.plannedColorId ? null : id;
  return LEGACY_BLOCK_COLOR_IDS.has(id) ? null : id;
}

/**
 * What a block's Google event needs so it follows the colour rule: nothing when
 * its colour was chosen by hand or is already `target` (and recorded as
 * TimeBlock's), else `target`.
 */
export function colorUpdate(event: BlockEventColor, target: string): 'chosen-by-hand' | 'up-to-date' | { set: string } {
  if (explicitColorId(event)) return 'chosen-by-hand';
  if (event.colorId === target && event.plannedColorId === target) return 'up-to-date';
  return { set: target };
}

/**
 * A block's colour: the colour set on its event in Google if someone set one,
 * else its window's (Learning work in Learning's colour), else — for work with
 * no window — its energy's.
 */
export function blockColor(windowHex: string | null | undefined, energy: Energy, event?: BlockEventColor | null): string {
  const chosen = explicitColorId(event);
  if (chosen) return EVENT_COLORS[chosen].hex;
  return windowHex ?? energyColor(energy);
}

/** White or near-black text, whichever reads better on `hex` (WCAG relative luminance). */
export function textOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return '#ffffff';
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.45 ? '#1f1f1f' : '#ffffff';
}

/**
 * Colours for time windows (Learning, Work…) that have not been given one in
 * Settings, by position. Chosen from Google's palette, so a block in the window
 * looks the same in Google (the first five are event colours), and away from the energy colours
 * (Blueberry, Peacock, Banana) that blocks with no window keep.
 */
export const WINDOW_PALETTE = ['#33B679', '#F4511E', '#8E24AA', '#E67C73', '#0B8043', '#795548'] as const;

const HEX = /^#[0-9a-f]{6}$/i;

/** A window's band colour: its own if set and valid, else the palette colour for its position. */
export function windowColor(color: string | null | undefined, index: number): string {
  if (color && HEX.test(color)) return color;
  return WINDOW_PALETTE[((index % WINDOW_PALETTE.length) + WINDOW_PALETTE.length) % WINDOW_PALETTE.length];
}

/**
 * Every window's colour, keyed by id. Palette colours follow the order windows
 * were created (their ids), not the order they are shown in, so sorting or
 * editing a window's hours never recolours the others.
 */
export function windowColors(windows: { id: number; color: string | null }[]): Map<number, string> {
  const byCreation = [...windows].sort((a, b) => a.id - b.id);
  return new Map(byCreation.map((w, i) => [w.id, windowColor(w.color, i)]));
}

/** `#rrggbb` from a form, or null for anything else (the palette then applies). */
export function parseHexColor(value: unknown): string | null {
  return typeof value === 'string' && HEX.test(value.trim()) ? value.trim().toLowerCase() : null;
}
