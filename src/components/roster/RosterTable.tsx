import { formatClassDateTimeLong } from '@/utils/format';
import type { RosterEntry, TrialClass } from '@/types';

/**
 * The confirmed roster.
 *
 * A real `<table>`, not a grid of divs. Screen readers announce the column
 * header with each cell, so a teacher hears "Child: Aisha Iqbal, Grade: 5"
 * instead of four unlabelled strings - and that only works with `<th scope>`.
 * The `<caption>` gives the table a name in the tables list.
 */
export function RosterTable({
  trialClass,
  entries,
}: {
  trialClass: TrialClass;
  entries: RosterEntry[];
}) {
  if (entries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-text-muted">
        No confirmed students yet. Bookings only appear here once payment has succeeded.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-sm">
        <caption className="sr-only">
          Confirmed students for {trialClass.subject} on{' '}
          {formatClassDateTimeLong(trialClass.startsAt)} UTC. {entries.length} of{' '}
          {trialClass.capacity} seats filled.
        </caption>

        <thead>
          <tr className="border-b border-border text-left">
            <th scope="col" className="py-2.5 pr-4 font-medium text-text-muted">
              #
            </th>
            <th scope="col" className="py-2.5 pr-4 font-medium text-text-muted">
              Child
            </th>
            <th scope="col" className="py-2.5 pr-4 font-medium text-text-muted">
              Grade
            </th>
            <th scope="col" className="py-2.5 font-medium text-text-muted">
              Parent
            </th>
          </tr>
        </thead>

        <tbody>
          {entries.map((entry, index) => (
            <tr key={entry.bookingId} className="border-b border-border last:border-0">
              <td className="py-3 pr-4 text-text-muted tabular-nums">{index + 1}</td>
              <td className="py-3 pr-4 font-medium text-text">{entry.studentName}</td>
              <td className="py-3 pr-4 text-text-muted tabular-nums">{entry.grade}</td>
              <td className="py-3 text-text-muted">
                {entry.parentName}
                <span className="block text-xs">{entry.parentEmail}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
