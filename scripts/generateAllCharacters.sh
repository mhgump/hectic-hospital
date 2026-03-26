#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

run() {
  local prompt="$1"
  local name="$2"
  local log="/tmp/ragdoll_${name}.log"
  echo "Starting: $name"
  npm run generateRagdoll -- "$prompt" "$name" > "$log" 2>&1 && echo "Done: $name" || echo "FAILED: $name (see $log)"
}

run "hospital nurse, female, white scrubs uniform, humanoid figure, full body, standing pose" nurse_0 &
run "hospital nurse, female, white scrubs uniform, humanoid figure, full body, standing pose" nurse_1 &
run "hospital nurse, female, white scrubs uniform, humanoid figure, full body, standing pose" nurse_2 &

run "hospital doctor, male, white lab coat, stethoscope, humanoid figure, full body, standing pose" doctor_0 &
run "hospital doctor, male, white lab coat, stethoscope, humanoid figure, full body, standing pose" doctor_1 &
run "hospital doctor, male, white lab coat, stethoscope, humanoid figure, full body, standing pose" doctor_2 &

run "hospital patient, male, light blue patient gown, humanoid figure, full body, standing pose" patient_male_0 &
run "hospital patient, male, light blue patient gown, humanoid figure, full body, standing pose" patient_male_1 &
run "hospital patient, male, light blue patient gown, humanoid figure, full body, standing pose" patient_male_2 &

run "hospital patient, female, light blue patient gown, humanoid figure, full body, standing pose" patient_female_0 &
run "hospital patient, female, light blue patient gown, humanoid figure, full body, standing pose" patient_female_1 &
run "hospital patient, female, light blue patient gown, humanoid figure, full body, standing pose" patient_female_2 &

wait
echo ""
echo "All done. Generated files:"
ls public/assets/models/ | grep -E "^(nurse_|doctor_|patient_)" | sort
