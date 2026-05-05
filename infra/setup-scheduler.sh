#!/bin/bash
PROJECT=vehicle-market-tracker

# Daily refresh at 2 AM Mountain Time.
# Override defaults per shell invocation if desired, e.g.
# REFRESH_MAKE=Honda REFRESH_MODEL=Civic REFRESH_YEAR=2019 bash infra/setup-scheduler.sh
REFRESH_MAKE=${REFRESH_MAKE:-Toyota}
REFRESH_MODEL=${REFRESH_MODEL:-Camry}
REFRESH_YEAR=${REFRESH_YEAR:-2020}

MESSAGE_BODY=$(printf '{"make":"%s","model":"%s","year":%s}' "$REFRESH_MAKE" "$REFRESH_MODEL" "$REFRESH_YEAR")

if gcloud scheduler jobs describe daily-vehicle-refresh --location=us-central1 --project=$PROJECT >/dev/null 2>&1; then
  gcloud scheduler jobs update pubsub daily-vehicle-refresh \
    --location=us-central1 \
    --schedule="0 2 * * *" \
    --time-zone="America/Denver" \
    --topic=vehicle-ingest \
    --message-body="$MESSAGE_BODY" \
    --attributes=type=vehicle,make="$REFRESH_MAKE",model="$REFRESH_MODEL",year="$REFRESH_YEAR" \
    --project=$PROJECT
else
  gcloud scheduler jobs create pubsub daily-vehicle-refresh \
    --location=us-central1 \
    --schedule="0 2 * * *" \
    --time-zone="America/Denver" \
    --topic=vehicle-ingest \
    --message-body="$MESSAGE_BODY" \
    --attributes=type=vehicle,make="$REFRESH_MAKE",model="$REFRESH_MODEL",year="$REFRESH_YEAR" \
    --project=$PROJECT
fi
