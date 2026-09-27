import { describe, expect, it } from 'vitest';
import type { Horizon } from '@/lib/db/schema';
import { indexHorizons } from '@/lib/hierarchy';
import { eventContent } from './event-content';

const horizon = (over: Partial<Horizon> & Pick<Horizon, 'id' | 'level' | 'title'>): Horizon => ({
  description: null,
  parentId: null,
  periodStart: '2026-10-01',
  periodEnd: '2026-10-31',
  status: 'active',
  windowId: null,
  sortOrder: 0,
  createdAt: '2026-09-24T00:00:00Z',
  ...over,
});

const byId = indexHorizons([
  horizon({ id: 1, level: 'year', title: 'CIS-ITSM Certification' }),
  horizon({ id: 2, level: 'month', title: 'ServiceNow ITSM Fundamentals', parentId: 1 }),
  horizon({ id: 3, level: 'week', title: 'Service Portfolio Management', parentId: 2, periodStart: '2026-09-28', periodEnd: '2026-10-04' }),
]);

const seg = (title: string, minutes: number) => ({
  minutes,
  task: { title, notes: null, energy: 'deep' as const, horizonId: 3 },
});

describe('calendar event content', () => {
  it('names a single-task block after the task', () => {
    expect(eventContent([seg('Operate IT Services', 38)], byId).summary).toBe('Operate IT Services');
  });

  it('names a combined block after its first task and lists every segment with its goal', () => {
    const content = eventContent(
      [seg('Ebook assistance', 5), seg('Accessibility information', 5), seg('Welcome to ITSM Fundamentals', 20)],
      byId,
    );

    expect(content.summary).toBe('Ebook assistance +2');
    expect(content.description).toContain('• Accessibility information — 5m');
    expect(content.description).toContain(
      'CIS-ITSM Certification › ServiceNow ITSM Fundamentals › Oct · week 1 · Service Portfolio Management',
    );
    expect(content.colorId).toBe('9');
  });
});
