#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

# Start the hospital server in the background
npm run hospital-server &
SERVER_PID=$!

# Start the Vite dev server (serves debug_rooms/index.html at /debug_rooms/)
npm run dev &
VITE_PID=$!

cleanup() {
  kill "$SERVER_PID" "$VITE_PID" 2>/dev/null
}
trap cleanup EXIT INT TERM

echo ""
echo "  Hospital server: http://localhost:3737/api/status"
echo "  Debug rooms UI:  http://localhost:5173/debug_rooms/"
echo ""
echo "  Press Ctrl+C to stop both servers."
echo ""

wait
