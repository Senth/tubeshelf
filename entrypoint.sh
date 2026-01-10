#!/bin/sh
set -e

# Ensure required directories/files
mkdir -p /app/data /app/.next/cache

# Start the application using npm start
exec dumb-init -- npm start
