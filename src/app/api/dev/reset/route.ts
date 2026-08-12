import { reseedDatabase } from '@/server/reseed';
import { jsonOk } from '@/server/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/dev/reset
 *
 * Drops and re-seeds the database so a demo can be run again without touching
 * a terminal. The race demo consumes the last Mathematics seat every time it
 * runs, and re-seeding by hand between takes is a good way to record a bad
 * video.
 *
 * Development only. Guarded rather than deleted so a reviewer can use it, and
 * it must never ship enabled.
 */
export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return new Response('Not found', { status: 404 });
  }

  await reseedDatabase();
  return jsonOk({ reset: true });
}
