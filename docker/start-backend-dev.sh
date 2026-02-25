#!/bin/sh
set -e

echo "Running Prisma migrations..."
npx prisma db push

echo "Starting backend in dev mode (watching for changes)..."
exec npx tsx watch --clear-screen=false src/index.ts
