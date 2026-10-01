import { NO_CATEGORY, type EventCategory } from '../db/schema';
import { eventColor, EVENT_COLORS } from './colors';

/**
 * Event categories: kinds of events that are not TimeBlock work (a client
 * meeting, travelling), each with a colour. An event's category is chosen by
 * hand on its series — so every repeat follows — or, when nobody chose, comes
 * from the first category (in their order) whose word its title contains.
 */

/** Lower case, accents removed: "Po Eminku do škôlky" → "po eminku do skolky". */
export function normalizeTitle(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** A category's words, normalised: one per line, or comma separated; blanks dropped. */
export function categoryWords(keywords: string): string[] {
  return keywords
    .split(/[\n,]/)
    .map(normalizeTitle)
    .filter((w) => w.length > 0);
}

const inOrder = (a: EventCategory, b: EventCategory) => a.sortOrder - b.sortOrder || a.id - b.id;

/** The first category (by order) one of whose words the title contains, else null. */
export function categoryByRule(title: string, categories: readonly EventCategory[]): EventCategory | null {
  const normalized = normalizeTitle(title);
  if (normalized === '') return null;
  return [...categories].sort(inOrder).find((c) => categoryWords(c.keywords).some((w) => normalized.includes(w))) ?? null;
}

export interface EventCategoryChoice {
  category: EventCategory | null;
  /** `chosen`: set by hand on the event (or "none" on purpose); `rule`: from a title word; null: no category. */
  source: 'chosen' | 'rule' | null;
}

/**
 * An event's category: the one chosen on its series (`mark.categoryId`), none
 * when "none" was chosen there, else the title rules'. A chosen category that
 * has since been deleted falls back to the rules.
 */
export function categoryOf(
  title: string,
  mark: { categoryId: number | null } | null | undefined,
  categories: readonly EventCategory[],
): EventCategoryChoice {
  const chosen = mark?.categoryId ?? null;
  if (chosen === NO_CATEGORY) return { category: null, source: 'chosen' };
  if (chosen !== null) {
    const category = categories.find((c) => c.id === chosen);
    if (category) return { category, source: 'chosen' };
  }
  const byRule = categoryByRule(title, categories);
  return byRule ? { category: byRule, source: 'rule' } : { category: null, source: null };
}

/** An event, as far as its Google colour goes: the colour now, and the one TimeBlock last gave it. */
export interface CategoryEventColor {
  colorId: string | null;
  /** The colour TimeBlock gave it (its private stamp), or null when it never coloured it. */
  plannedColorId: string | null;
}

/**
 * Whether someone changed the event's colour in Google after TimeBlock gave it
 * one: that choice wins over the category's. An event TimeBlock never coloured
 * takes its category's colour, whatever colour it had.
 */
export function colorChosenInGoogle(event: CategoryEventColor): boolean {
  return event.plannedColorId !== null && event.colorId !== event.plannedColorId;
}

/** What an event's Google colour needs for its category: nothing, or the colour to set. */
export function categoryColorUpdate(event: CategoryEventColor, target: string): 'chosen-by-hand' | 'up-to-date' | { set: string } {
  if (colorChosenInGoogle(event)) return 'chosen-by-hand';
  if (event.colorId === target && event.plannedColorId === target) return 'up-to-date';
  return { set: target };
}

/**
 * How TimeBlock's calendar draws an event: a colour chosen in Google after
 * TimeBlock coloured it wins; else its category's colour; else Google's own
 * (the event's, or its calendar's).
 */
export function categorizedEventColor(
  event: CategoryEventColor,
  category: Pick<EventCategory, 'color'> | null,
  calendarBackground: string | null | undefined,
): string {
  if (category && !colorChosenInGoogle(event)) return category.color;
  return eventColor(event.colorId, calendarBackground);
}

/** Google's own colour ids, for a picker: id → name and hex. */
export { EVENT_COLORS };
