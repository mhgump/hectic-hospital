#!/bin/bash
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <iterations>"
  exit 1
fi

ITERATIONS="$1"
TMP_OUT="/tmp/ralph_last_output.txt"

for ((i=1; i<=ITERATIONS; i++)); do
  echo "========================================"
  echo "RALPH ITERATION $i / $ITERATIONS"
  echo "========================================"

  # Run Claude and STREAM output live
  claude \
    --dangerously-skip-permissions \
    --permission-mode acceptEdits \
    -p "@storyteller-plan.md @progress.txt
1. Check git status for recent commits to see what has been done.
2. Find the highest-priority next task and implement it.
   You decide priority — not necessarily the first item.
3. Run tests and type checks. Add tests if they're missing. 
   Read realtime-testing.md.
   Do not be lazy. Quality over speed.
4. Update the PRD with what was done.
5. Append your progress to progress.txt.
6. Commit your changes with a clear message.
7. ONLY WORK ON A SINGLE TASK.
8. This is an agent loop. Do not delete the codebase.
   Do not switch products.
   If you are blocked, explain why in progress.txt. You are operating in a multi agent environment. Do not revert changes that other agents have made. 
9. If the entire PRD is completely complete - theres nothing more to do (or you cannot proceed) anywhere in the plan document,
   output exactly: <promise>COMPLETE</promise>
" | tee "$TMP_OUT"

  # Capture result for completion detection
  result="$(cat "$TMP_OUT")"

  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo
    echo "🎉 PRD complete after $i iterations."
    exit 0
  fi

  echo
  echo "Iteration $i complete. Continuing…"
  echo
done

echo "⚠️ Reached max iterations ($ITERATIONS) without completion."
exit 1

