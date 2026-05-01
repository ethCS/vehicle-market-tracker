# GitHub Copilot: Vehicle Market Tracker — Full Implementation Prompt

This repository follows the project specification used to build a cloud-based vehicle market intelligence application for CSCI391.

## Project Identity
- Repo: ethCS/vehicle-market-tracker
- Firebase Project ID: vehicle-market-tracker
- Firebase Project Number: 211740032292
- Goal: Search by make/model/year and provide current and historical pricing insights plus a buy-vs-wait score.

## Stack
- Next.js 14 (App Router, TypeScript) on Cloud Run
- Firestore
- Cloud Functions (2nd gen, Node.js 20)
- Pub/Sub and Cloud Scheduler
- NHTSA vPIC + CarQuery APIs
- Firebase Auth scaffold
- Tailwind CSS + Recharts

## Notes
- Keep Firestore as the only database.
- Keep Cloud Run as the only frontend/API hosting target.
- Use deterministic price simulation strategy from project docs.
- Keep API responses typed and convert Firestore timestamps to ISO strings.
- Keep TypeScript strict mode enabled and avoid any.
