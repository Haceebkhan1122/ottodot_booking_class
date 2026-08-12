'use client';

import { create } from 'zustand';
import type { Tone } from '@/helpers/bookingStatus';

/**
 * The only global state in the app.
 *
 * Two things earn a place here, and nothing else does:
 *
 *  1. `selectedParentId` - stands in for a session. It is read on several
 *     screens and changing it has to be felt everywhere at once, so threading
 *     it through props would mean passing it through components that have no
 *     interest in it.
 *
 *  2. Toasts - fired from deep inside forms, rendered once at the root.
 *
 * Server data is pointedly absent. Seat counts and booking statuses are not
 * mirrored into a client store, because a mirror can disagree with the server
 * and this is the one app where a stale seat count is the actual bug we are
 * being asked to prevent.
 */

export interface Toast {
  id: string;
  tone: Tone;
  title: string;
  description?: string;
  /**
   * A way out of the problem, not just a description of it.
   *
   * Used by the duplicate-booking refusal: the rule that blocked the parent
   * also hides the booking that caused it, so the toast has to carry the link
   * or there is nowhere to go.
   */
  action?: { label: string; href: string };
  /**
   * Errors are announced assertively and interrupt the screen reader; routine
   * confirmations wait their turn. Getting this backwards makes an app either
   * unusable or unsafe.
   */
  assertive?: boolean;
}

/**
 * Session storage, not local storage.
 *
 * The parent selector stands in for "who is signed in", so it should behave
 * like a session: survive a refresh, die with the tab. Persisting it at all
 * matters because a reviewer who reloads mid-demo would otherwise be silently
 * switched back to the first parent and wonder why their child disappeared.
 */
const PARENT_STORAGE_KEY = 'ottodot.selectedParentId';

/**
 * Read outside of render, never during it.
 *
 * The store is deliberately initialised to `null` rather than seeded from
 * storage: the server cannot read sessionStorage, so seeding here would make
 * the first client render disagree with the server's HTML and trip hydration.
 * The value is applied from an effect instead.
 */
export function readStoredParentId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(PARENT_STORAGE_KEY);
  } catch {
    // Private browsing and some embedded webviews throw on access.
    return null;
  }
}

function writeStoredParentId(parentId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (parentId) window.sessionStorage.setItem(PARENT_STORAGE_KEY, parentId);
    else window.sessionStorage.removeItem(PARENT_STORAGE_KEY);
  } catch {
    // Losing the preference is acceptable; throwing on a click is not.
  }
}

interface AppState {
  selectedParentId: string | null;
  setSelectedParentId: (parentId: string | null) => void;

  toasts: Toast[];
  pushToast: (toast: Omit<Toast, 'id'>) => string;
  dismissToast: (id: string) => void;
}

let toastCounter = 0;

export const useAppStore = create<AppState>((set, get) => ({
  selectedParentId: null,

  setSelectedParentId: (parentId) => {
    writeStoredParentId(parentId);
    set({ selectedParentId: parentId });
  },

  toasts: [],

  pushToast: (toast) => {
    /*
     * Identical messages collapse into one.
     *
     * Error toasts do not auto-dismiss, because a message that vanishes before
     * it is read is its own accessibility problem. But that rule was never
     * meant to reward a triple click with three stacked copies of the same
     * sentence - clicking a blocked button repeatedly is the most likely thing
     * a confused parent will do.
     */
    const existing = get().toasts.find(
      (t) => t.title === toast.title && t.description === toast.description,
    );
    if (existing) return existing.id;

    toastCounter += 1;
    const id = `toast_${toastCounter}`;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    return id;
  },

  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}));
