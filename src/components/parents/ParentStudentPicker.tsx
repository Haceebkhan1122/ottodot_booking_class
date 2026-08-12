'use client';

import { Card } from '@/components/ui/Card';
import { cn } from '@/utils/cn';
import type { Parent, Student } from '@/types';

interface ParentStudentPickerProps {
  parents: Parent[];
  selectedParentId: string | null;
  selectedStudentId: string | null;
  onSelectParent: (parentId: string) => void;
  onSelectStudent: (studentId: string) => void;
}

/**
 * Stands in for "who is logged in" and "which child is this for".
 *
 * There is no authentication in this exercise, so parent identity is picked
 * openly rather than pretended at with a fake login screen. A reviewer can
 * switch parents mid-demo, which is exactly what the last-seat race needs.
 *
 * Both controls are native `<select>` elements. On mobile that gets the OS
 * picker, and with a screen reader it gets the listbox semantics for free -
 * a custom dropdown would have to earn all of that back by hand.
 */
export function ParentStudentPicker({
  parents,
  selectedParentId,
  selectedStudentId,
  onSelectParent,
  onSelectStudent,
}: ParentStudentPickerProps) {
  const selectedParent = parents.find((p) => p.id === selectedParentId) ?? null;
  const students: Student[] = selectedParent?.students ?? [];

  return (
    <Card className="border-dashed">
      <div className="mb-4">
        <div className="flex items-baseline gap-2">
          <h2 className="text-sm font-semibold text-text">Who is booking?</h2>
          <span className="text-xs text-text-muted">
            Stands in for a signed-in session
          </span>
        </div>
        {/*
          Said plainly, because the alternative confuses people: the classes
          below are not empty, and none of those seats are yours.
        */}
        <p className="mt-1 text-xs leading-relaxed text-text-muted">
          You start with no bookings. Other families already hold some seats, so the
          classes below begin part-full.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Parent" htmlFor="parent-select">
          <select
            id="parent-select"
            value={selectedParentId ?? ''}
            onChange={(event) => onSelectParent(event.target.value)}
            className={selectClasses}
          >
            {parents.map((parent) => (
              <option key={parent.id} value={parent.id}>
                {parent.name}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Child"
          htmlFor="student-select"
          hint={students.length === 0 ? 'This parent has no children on file.' : undefined}
        >
          <select
            id="student-select"
            value={selectedStudentId ?? ''}
            onChange={(event) => onSelectStudent(event.target.value)}
            disabled={students.length === 0}
            aria-describedby={students.length === 0 ? 'student-select-hint' : undefined}
            className={cn(selectClasses, students.length === 0 && 'opacity-60')}
          >
            {students.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name} · Grade {student.grade}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Card>
  );
}

const selectClasses = cn(
  'h-11 w-full rounded-lg border border-border-strong bg-surface px-3',
  'text-sm text-text',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ring)]',
);

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      {/* A real <label>, not a styled span. Clicking it focuses the control
          and screen readers announce the two together (WCAG 1.3.1, 3.3.2). */}
      <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-text-muted">
        {label}
      </label>
      {children}
      {hint && (
        <p id={`${htmlFor}-hint`} className="mt-1.5 text-xs text-text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
