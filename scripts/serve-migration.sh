#!/bin/sh
# Run the operator migration once, then keep the process alive.
#
# Some networks only reach the database from inside the deployment platform.
# This entrypoint lets a temporary web service run `auth:migrate` and expose a
# trivial health endpoint afterwards, so the platform can report the deploy and
# keep the logs available. It is not part of the API process.
set -u

bun /app/scripts/migrate-operators.ts
status=$?
if [ "$status" -ne 0 ]; then
  echo "migration exited with status $status" >&2
  exit "$status"
fi

exec bun -e 'Bun.serve({
  port: Number(process.env.PORT ?? 10000),
  fetch: () => new Response("migration done"),
})'
