import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /*
   * Keep the dev file-watcher away from data directories.
   *
   * The local Postgres server writes to its data directory continuously. When
   * that directory sat inside the project root, the watcher treated every WAL
   * flush as a source change: the dev server recompiled in a loop and
   * occasionally read a half-written build manifest, which surfaced as a
   * random `SyntaxError: Unexpected end of JSON input` and a 500 on whichever
   * request happened to be in flight.
   *
   * `db:local` now keeps its data under node_modules/.cache, which webpack
   * already ignores. These entries are the second line of defence, and cover
   * anyone who points LOCAL_PG_DATA_DIR back into the repo.
   */
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/node_modules/**', '**/.git/**', '**/.next/**', '**/.pgdata/**'],
    };
    return config;
  },
};

export default nextConfig;
