#!/bin/bash
PROJECT=vehicle-market-tracker

set -e

gcloud pubsub topics describe vehicle-ingest --project=$PROJECT >/dev/null 2>&1 || \
  gcloud pubsub topics create vehicle-ingest --project=$PROJECT

gcloud pubsub topics describe price-ingest --project=$PROJECT >/dev/null 2>&1 || \
  gcloud pubsub topics create price-ingest --project=$PROJECT

echo "Pub/Sub topics ready: vehicle-ingest, price-ingest"
