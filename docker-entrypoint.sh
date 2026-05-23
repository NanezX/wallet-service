#!/bin/sh
set -e

echo "Running database migrations..."
node dist/db/migrate.js

echo "Starting wallet-service..."
exec node dist/main.js
