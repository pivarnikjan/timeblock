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
 * TimeBlock's blocks use the colours they get in Google once committed, so a
 * draft looks the same before and after it reaches the calendar.
 */
export const ENERGY_COLOR_ID: Record<Energy, string> = {
  deep: '9', // Blueberry
  shallow: '7', // Peacock
  admin: '5', // Banana
};

export function energyColor(energy: Energy): string {
  return EVENT_COLORS[ENERGY_COLOR_ID[energy]].hex;
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
 * Settings, by position. Chosen from Google's palette but away from the three
 * block colours (Blueberry, Peacock, Banana), so a window band never looks
 * like a block.
 */
export const WINDOW_PALETTE = ['#33B679', '#F4511E', '#8E24AA', '#E67C73', '#0B8043', '#795548'] as const;

const HEX = /^#[0-9a-f]{6}$/i;

/** A window's band colour: its own if set and valid, else the palette colour for its position. */
export function windowColor(color: string | null | undefined, index: number): string {
  if (color && HEX.test(color)) return color;
  return WINDOW_PALETTE[((index % WINDOW_PALETTE.length) + WINDOW_PALETTE.length) % WINDOW_PALETTE.length];
}

/** `#rrggbb` from a form, or null for anything else (the palette then applies). */
export function parseHexColor(value: unknown): string | null {
  return typeof value === 'string' && HEX.test(value.trim()) ? value.trim().toLowerCase() : null;
}
