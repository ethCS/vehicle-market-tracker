#!/bin/bash
PROJECT=vehicle-market-tracker

# Daily price refresh at 2 AM Mountain Time
gcloud scheduler jobs create pubsub daily-price-refresh \
  --schedule="0 2 * * *" \
  --time-zone="America/Denver" \
  --topic=price-ingest \
  --message-body='{"type":"scheduled_refresh"}' \
  --project=$PROJECT
