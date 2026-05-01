#!/bin/bash
PROJECT=vehicle-market-tracker
REGION=us-central1
SERVICE=vehicle-market-tracker

gcloud builds submit --tag gcr.io/$PROJECT/$SERVICE
gcloud run deploy $SERVICE \
  --image gcr.io/$PROJECT/$SERVICE \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --set-env-vars GCLOUD_PROJECT=$PROJECT \
  --project $PROJECT
