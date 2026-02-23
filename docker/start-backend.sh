#!/bin/sh
set -e

echo "Running Prisma migrations..."
npx prisma db push

echo "Starting backend server..."
exec node dist/index.js
