#!/bin/bash
PROJECT=vehicle-market-tracker
REGION=us-central1
SERVICE=vehicle-market-tracker

gcloud builds submit --tag gcr.io/$PROJECT/$SERVICE
gcloud run deploy $SERVICE \
  --image gcr.io/$PROJECT/$SERVICE \
  --platform managed \
  --region $REGION \
  --clear-base-image \
  --allow-unauthenticated \
  --set-env-vars GCLOUD_PROJECT=$PROJECT,PUBSUB_TOPIC_INGEST=vehicle-ingest,PUBSUB_TOPIC_PRICES=price-ingest,FB_ADMIN_PROJECT_ID=$PROJECT,MARKETCHECK_COUNTRY=us,MARKETCHECK_ROWS=25 \
  --set-secrets MARKETCHECK_API_KEY=MARKETCHECK_API_KEY:latest,MARKETCHECK_CLIENT_SECRET=MARKETCHECK_CLIENT_SECRET:latest,INGEST_SECRET=INGEST_SECRET:latest \
  --project $PROJECT
