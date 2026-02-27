#!/usr/bin/env bash
# =============================================================================
# deploy.sh — One-command deployment of The Living Textbook to Google Cloud
#
# Prerequisites:
#   - gcloud CLI installed and authenticated (gcloud auth login)
#   - Required APIs enabled (script enables them automatically)
#   - Environment variables set (copy backend/.env.example → backend/.env)
#
# Usage:
#   chmod +x deploy/deploy.sh
#   GCP_PROJECT=my-project GCS_BUCKET=my-bucket ./deploy/deploy.sh
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration — override via env vars
# ---------------------------------------------------------------------------
GCP_PROJECT="${GCP_PROJECT:?Please set GCP_PROJECT}"
GCS_BUCKET="${GCS_BUCKET:?Please set GCS_BUCKET}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-living-textbook-api}"
IMAGE_NAME="gcr.io/${GCP_PROJECT}/${SERVICE_NAME}"

echo "========================================"
echo "  Deploying: The Living Textbook"
echo "  Project:   ${GCP_PROJECT}"
echo "  Region:    ${REGION}"
echo "  Service:   ${SERVICE_NAME}"
echo "========================================"

# ---------------------------------------------------------------------------
# 1. Enable required Google Cloud APIs
# ---------------------------------------------------------------------------
echo "[1/6] Enabling Cloud APIs..."
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  aiplatform.googleapis.com \
  storage.googleapis.com \
  --project="${GCP_PROJECT}"

# ---------------------------------------------------------------------------
# 2. Create GCS bucket (if it doesn't exist)
# ---------------------------------------------------------------------------
echo "[2/6] Setting up Cloud Storage bucket..."
gsutil ls -b "gs://${GCS_BUCKET}" 2>/dev/null || \
  gsutil mb -l "${REGION}" -p "${GCP_PROJECT}" "gs://${GCS_BUCKET}"

# Make bucket accessible for signed URL generation
gsutil iam ch allUsers:objectViewer "gs://${GCS_BUCKET}" || true

# ---------------------------------------------------------------------------
# 3. Build and push Docker image via Cloud Build
# ---------------------------------------------------------------------------
echo "[3/6] Building Docker image..."
gcloud builds submit backend/ \
  --tag="${IMAGE_NAME}:latest" \
  --project="${GCP_PROJECT}"

# ---------------------------------------------------------------------------
# 4. Deploy to Cloud Run
# ---------------------------------------------------------------------------
echo "[4/6] Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image="${IMAGE_NAME}:latest" \
  --platform=managed \
  --region="${REGION}" \
  --project="${GCP_PROJECT}" \
  --allow-unauthenticated \
  --port=8080 \
  --timeout=3600 \
  --concurrency=80 \
  --min-instances=1 \
  --max-instances=10 \
  --memory=1Gi \
  --cpu=1 \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=${GCP_PROJECT},GOOGLE_CLOUD_LOCATION=${REGION},GCS_BUCKET_NAME=${GCS_BUCKET}"

# ---------------------------------------------------------------------------
# 5. Get the service URL
# ---------------------------------------------------------------------------
echo "[5/6] Retrieving service URL..."
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region="${REGION}" \
  --project="${GCP_PROJECT}" \
  --format="value(status.url)")

WS_URL="${SERVICE_URL/https:\/\//wss://}/ws"

echo ""
echo "========================================"
echo "  Deployment complete!"
echo "  Backend URL: ${SERVICE_URL}"
echo "  WebSocket:   ${WS_URL}"
echo "========================================"

# ---------------------------------------------------------------------------
# 6. Build and export frontend with the live WS URL
# ---------------------------------------------------------------------------
echo "[6/6] Building frontend..."
cd frontend
NEXT_PUBLIC_WS_URL="${WS_URL}" npm run build
echo ""
echo "Frontend built. Deploy the 'frontend/out' directory or run:"
echo "  NEXT_PUBLIC_WS_URL=${WS_URL} npm run start"
