let last = 0;

/**
 * A row id both devices can hand out without asking each other: the creation
 * time in milliseconds, times 1024, plus ten random bits. Two devices would
 * have to create a row in the same millisecond and draw the same bits to
 * collide, and ids still grow with creation time — so "sorted by id" keeps
 * meaning "in the order they were made", and every new id sorts after the
 * small autoincrement ids made before sync existed. Stays within JavaScript's
 * safe integers until the year 2248.
 */
export function newId(now: number = Date.now()): number {
  const candidate = now * 1024 + Math.floor(Math.random() * 1024);
  // Several rows in one millisecond on this device: count up instead of redrawing.
  last = Math.max(candidate, last + 1);
  return last;
}
