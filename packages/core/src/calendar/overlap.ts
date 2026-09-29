/** Whether [aStart, aEnd) and [bStart, bEnd) share any time. ISO instants compare as instants. */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return Date.parse(aStart) < Date.parse(bEnd) && Date.parse(aEnd) > Date.parse(bStart);
}
