import { describe, expect, it } from 'vitest';
import { NO_CATEGORY, type EventCategory } from '../db/schema';
import { categorizedEventColor, categoryByRule, categoryColorUpdate, categoryOf, categoryWords, normalizeTitle } from './categories';

const cat = (id: number, name: string, keywords: string, sortOrder = id, color = '#616161'): EventCategory => ({ id, name, color, keywords, sortOrder });
const traveling = cat(1, 'Traveling', 'škôlky\nletisko', 1, '#616161');
const client = cat(2, 'AT&T', 'AT&T, att meeting', 2, '#3F51B5');

describe('event categories', () => {
  it('matches title words ignoring case and accents', () => {
    expect(normalizeTitle('Po Eminku do ŠKÔLKY')).toBe('po eminku do skolky');
    expect(categoryWords(' AT&T, att meeting\n\n')).toEqual(['at&t', 'att meeting']);
    expect(categoryByRule('Po Eminku do skolky', [client, traveling])?.name).toBe('Traveling');
    expect(categoryByRule('Weekly sync with at&t', [client, traveling])?.name).toBe('AT&T');
    expect(categoryByRule('Lunch', [client, traveling])).toBeNull();
  });

  it('tries the categories in their order', () => {
    const first = cat(5, 'First', 'sync', 0);
    const second = cat(4, 'Second', 'sync', 1);
    expect(categoryByRule('sync', [second, first])?.name).toBe('First');
  });

  it('prefers a category chosen by hand, honours "none", and falls back to the rules', () => {
    expect(categoryOf('Po Eminku do skolky', { categoryId: 2 }, [traveling, client])).toEqual({ category: client, source: 'chosen' });
    expect(categoryOf('Po Eminku do skolky', { categoryId: NO_CATEGORY }, [traveling, client])).toEqual({ category: null, source: 'chosen' });
    expect(categoryOf('Po Eminku do skolky', null, [traveling, client])).toEqual({ category: traveling, source: 'rule' });
    // A chosen category deleted since: the rules decide again.
    expect(categoryOf('Po Eminku do skolky', { categoryId: 99 }, [traveling])).toEqual({ category: traveling, source: 'rule' });
    expect(categoryOf('Lunch', { categoryId: null }, [traveling])).toEqual({ category: null, source: null });
  });

  it('keeps a colour chosen in Google after TimeBlock coloured the event', () => {
    // Never coloured by TimeBlock: the category's colour applies, whatever colour it had.
    expect(categoryColorUpdate({ colorId: '11', plannedColorId: null }, '8')).toEqual({ set: '8' });
    expect(categorizedEventColor({ colorId: '11', plannedColorId: null }, traveling, '#039be5')).toBe('#616161');
    // Coloured by TimeBlock and unchanged: up to date.
    expect(categoryColorUpdate({ colorId: '8', plannedColorId: '8' }, '8')).toBe('up-to-date');
    // Changed in Google since: that colour wins, in Google and on TimeBlock's calendar.
    expect(categoryColorUpdate({ colorId: '11', plannedColorId: '8' }, '8')).toBe('chosen-by-hand');
    expect(categorizedEventColor({ colorId: '11', plannedColorId: '8' }, traveling, '#039be5')).not.toBe('#616161');
    // No category: Google's colour (the calendar's here).
    expect(categorizedEventColor({ colorId: null, plannedColorId: null }, null, '#039be5')).toBe('#039be5');
  });
});
