import 'server-only';
import { withEnv } from '@/lib/env';
import * as conflicts from '@timeblock/core/calendar/vacation-conflicts';

export { conflictValue, type Conflict, type ConflictTarget, type Conflicts } from '@timeblock/core/calendar/vacation-conflicts';

/** Everything already scheduled during a vacation: Google events and TimeBlock's blocks. */
export const vacationConflicts = withEnv(conflicts.vacationConflicts);
