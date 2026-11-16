#!/bin/bash
# ==================================================================
# MeshFlow — Kubernetes Setup Script (Kind)
# ==================================================================
# This script sets up a local Kind cluster, installs the NGINX
# Ingress Controller, deploys PostgreSQL and all three microservices,
# and verifies the full system is running.
#
# Prerequisites:
#   - Docker running
#   - kind installed (winget install Kubernetes.kind)
#   - kubectl installed
#
# Usage:
#   bash scripts/k8s-setup.sh
# ==================================================================

set -euo pipefail

CLUSTER_NAME="meshflow"
NAMESPACE="meshflow"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log()   { echo -e "${CYAN}[MeshFlow]${NC} $1"; }
ok()    { echo -e "${GREEN}[  ✔  ]${NC} $1"; }
warn()  { echo -e "${YELLOW}[ WARN]${NC} $1"; }
fail()  { echo -e "${RED}[FAIL ]${NC} $1"; exit 1; }

# ---- Step 1: Preflight Checks ----
log "Running preflight checks..."

command -v docker >/dev/null 2>&1 || fail "Docker is not installed."
docker info >/dev/null 2>&1     || fail "Docker daemon is not running. Start Docker Desktop first."
command -v kind >/dev/null 2>&1  || fail "Kind is not installed. Run: winget install Kubernetes.kind"
command -v kubectl >/dev/null 2>&1 || fail "kubectl is not installed."

ok "All prerequisites satisfied."

# ---- Step 2: Create Kind Cluster ----
if kind get clusters 2>/dev/null | grep -q "^${CLUSTER_NAME}$"; then
    warn "Kind cluster '${CLUSTER_NAME}' already exists. Deleting and recreating..."
    kind delete cluster --name "$CLUSTER_NAME"
fi

log "Creating Kind cluster '${CLUSTER_NAME}' with port mappings..."
kind create cluster --name "$CLUSTER_NAME" --config "${PROJECT_DIR}/kind-config.yaml"
ok "Kind cluster created."

# ---- Step 3: Install NGINX Ingress Controller ----
log "Installing NGINX Ingress Controller for Kind..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

log "Waiting for Ingress Controller pods to be created..."
# The Deployment takes a few seconds to schedule pods. Loop until at
# least one pod matching the selector exists before calling kubectl wait.
for i in $(seq 1 30); do
    POD_COUNT=$(kubectl get pods --namespace ingress-nginx \
        --selector=app.kubernetes.io/component=controller \
        --no-headers 2>/dev/null | wc -l)
    if [ "$POD_COUNT" -gt 0 ]; then
        break
    fi
    echo "  ...pods not created yet, retrying in 5s ($i/30)"
    sleep 5
done

log "Waiting for Ingress Controller to be ready (up to 120s)..."
kubectl wait --namespace ingress-nginx \
    --for=condition=ready pod \
    --selector=app.kubernetes.io/component=controller \
    --timeout=120s
ok "NGINX Ingress Controller is ready."

# ---- Step 4: Load Docker Images into Kind ----
log "Loading Docker images into Kind cluster..."

IMAGES=(
    "abhijeetsoni08/meshflow-user-service:latest"
    "abhijeetsoni08/meshflow-product-service:latest"
    "abhijeetsoni08/meshflow-order-service:latest"
)

for img in "${IMAGES[@]}"; do
    if docker image inspect "$img" >/dev/null 2>&1; then
        kind load docker-image "$img" --name "$CLUSTER_NAME"
        ok "Loaded $img"
    else
        warn "$img not found locally. Kind will try to pull it from Docker Hub."
    fi
done

# ---- Step 5: Deploy K8s Resources ----
log "Deploying MeshFlow to Kubernetes..."

# Namespace first
kubectl apply -f "${PROJECT_DIR}/k8s/namespace.yaml"
ok "Namespace '${NAMESPACE}' created."

# PostgreSQL (includes Secret, ConfigMap, Deployment, Service)
kubectl apply -f "${PROJECT_DIR}/k8s/postgres.yaml"
ok "PostgreSQL manifests applied."

log "Waiting for PostgreSQL pod to be ready..."
kubectl wait --namespace "$NAMESPACE" \
    --for=condition=ready pod \
    --selector=app=postgres \
    --timeout=120s
ok "PostgreSQL is ready."

# Microservices
for svc in user-service product-service order-service; do
    kubectl apply -f "${PROJECT_DIR}/${svc}/k8s/deployment.yaml"
    kubectl apply -f "${PROJECT_DIR}/${svc}/k8s/service.yaml"
    ok "Deployed ${svc}."
done

# Frontend UI Portal
kubectl create configmap frontend-html \
    --from-file=index.html="${PROJECT_DIR}/frontend/index.html" \
    --namespace "$NAMESPACE" \
    --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f "${PROJECT_DIR}/frontend/k8s/deployment.yaml"
kubectl apply -f "${PROJECT_DIR}/frontend/k8s/service.yaml"
ok "Deployed frontend portal."

# Ingress
kubectl apply -f "${PROJECT_DIR}/k8s/ingress.yaml"
ok "Ingress rules applied."

# ---- Step 6: Wait for All Pods ----
log "Waiting for all microservice pods to be ready (up to 180s)..."
for svc in user-service product-service order-service frontend; do
    kubectl wait --namespace "$NAMESPACE" \
        --for=condition=ready pod \
        --selector=app="$svc" \
        --timeout=180s
    ok "${svc} pods are ready."
done

# ---- Step 7: Final Status ----
echo ""
echo "=========================================="
echo "  MeshFlow is running on Kubernetes! 🚀"
echo "=========================================="
echo ""
kubectl get pods -n "$NAMESPACE"
echo ""
kubectl get svc -n "$NAMESPACE"
echo ""
kubectl get ingress -n "$NAMESPACE"
echo ""
log "Test it out:"
echo "  curl http://localhost/products"
echo "  curl http://localhost/users/register -X POST -H 'Content-Type: application/json' -d '{\"name\":\"Test\",\"email\":\"test@test.com\",\"password\":\"Pass123!\"}'"
echo ""
log "To tear down: kind delete cluster --name ${CLUSTER_NAME}"
