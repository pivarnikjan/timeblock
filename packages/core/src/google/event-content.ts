import type { Energy } from '../db/schema';
import { ENERGY_COLOR_ID } from '../calendar/colors';
import { breadcrumb, formatMinutes, type HorizonIndex } from '../hierarchy';

export interface EventSegment {
  minutes: number;
  task: { title: string; notes: string | null; energy: Energy; horizonId: number | null };
}

/**
 * What a calendar event says about a block. One task: its title. Several
 * combined short tasks: "First task +2", with the full list — minutes and the
 * goal each serves — in the description, so the event reads on its own.
 */
export function eventContent(
  segments: EventSegment[],
  byId: HorizonIndex,
): { summary: string; description: string; colorId: string } {
  if (segments.length === 0) return { summary: 'Focus block', description: '', colorId: ENERGY_COLOR_ID.deep };

  const [first] = segments;
  const summary = segments.length === 1 ? first.task.title : `${first.task.title} +${segments.length - 1}`;

  const lines = segments.map((s) => {
    const trail = breadcrumb(s.task.horizonId, byId);
    return [`• ${s.task.title} — ${formatMinutes(s.minutes)}`, trail.length > 0 ? `  ${trail.join(' › ')}` : null]
      .filter(Boolean)
      .join('\n');
  });
  const notes = segments.length === 1 && first.task.notes ? `\n\n${first.task.notes}` : '';

  return {
    summary,
    description: `${lines.join('\n')}${notes}\n\nPlanned by TimeBlock.`,
    colorId: ENERGY_COLOR_ID[first.task.energy],
  };
}
