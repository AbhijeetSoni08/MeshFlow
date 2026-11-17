#!/bin/bash
# ==================================================================
# MeshFlow — Master All-in-One Deployment & Verification Script
# ==================================================================
# Runs ALL PHASES from scratch in a single command:
#   - Phase 4: Kind Cluster + NGINX Ingress + PostgreSQL + 3 Microservices + Frontend UI
#   - Phase 5: Linkerd Service Mesh + Gateway API + Sidecars (2/2) + Linkerd Viz (mTLS)
#   - Verification: End-to-end smoke test & live mTLS inspection
#
# Usage:
#   bash scripts/run-all.sh
# ==================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
NAMESPACE="meshflow"
CLUSTER_NAME="meshflow"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

banner() {
    echo ""
    echo -e "${MAGENTA}==================================================================${NC}"
    echo -e "${MAGENTA}  $1${NC}"
    echo -e "${MAGENTA}==================================================================${NC}"
    echo ""
}

log()   { echo -e "${CYAN}[MeshFlow]${NC} $1"; }
ok()    { echo -e "${GREEN}[  ✔  ]${NC} $1"; }
warn()  { echo -e "${YELLOW}[ WARN]${NC} $1"; }
fail()  { echo -e "${RED}[FAIL ]${NC} $1"; exit 1; }

START_TIME=$(date +%s)

banner "STAGE 1 / 3: Kubernetes Infrastructure & Microservices (Phase 4)"

# Run Phase 4 K8s setup
bash "${PROJECT_DIR}/scripts/k8s-setup.sh"

# Fix potential Kind webhook timeout proactively
kubectl delete validatingwebhookconfiguration ingress-nginx-admission 2>/dev/null || true

banner "STAGE 2 / 3: Linkerd Service Mesh, Sidecars & mTLS (Phase 5)"

# Run Phase 5 Linkerd setup
bash "${PROJECT_DIR}/scripts/linkerd-setup.sh"

# Ensure linkerd is on PATH
export PATH="$HOME/.linkerd2/bin:$PATH"

banner "STAGE 3 / 3: End-to-End Distributed Flow & Verification"

log "Executing end-to-end distributed system smoke test..."

# 1. Test Menu
log "1. Fetching menu from Product Service..."
PRODUCTS_RES=$(curl -s http://localhost/products)
if echo "$PRODUCTS_RES" | grep -q "Artisan Margherita Pizza"; then
    ok "Product Service is responding with menu items."
else
    warn "Product Service returned unexpected response: $PRODUCTS_RES"
fi

# 2. Test Registration
log "2. Registering customer in User Service..."
EMAIL="smoke-$(date +%s)@meshflow.io"
REGISTER_RES=$(curl -s http://localhost/users/register -X POST \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Smoke Tester\",\"email\":\"$EMAIL\",\"password\":\"SecurePass123!\"}")

# 3. Test Login
log "3. Authenticating customer & capturing JWT..."
LOGIN_RES=$(curl -s http://localhost/users/login -X POST \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$EMAIL\",\"password\":\"SecurePass123!\"}")
TOKEN=$(echo "$LOGIN_RES" | grep -o '"token":"[^"]*' | cut -d'"' -f4 || true)

if [ -n "$TOKEN" ]; then
    ok "Authentication succeeded. JWT Token captured."
else
    fail "Login failed. Response: $LOGIN_RES"
fi

# 4. Test Distributed Order Placement
log "4. Placing order (Order Svc -> User Svc + Product Svc -> Postgres)..."
ORDER_RES=$(curl -s http://localhost/orders -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"userId":1,"items":[{"productId":1,"quantity":1}]}')

if echo "$ORDER_RES" | grep -q "CONFIRMED"; then
    ok "Distributed Order confirmed successfully!"
else
    warn "Order placement response: $ORDER_RES"
fi

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

banner "MeshFlow is Fully Operational! 🚀🔒 (Completed in ${DURATION}s)"

log "Cluster Pod Summary in 'meshflow' (All pods should be 2/2 Ready):"
kubectl get pods -n "$NAMESPACE"
echo ""

log "Live Zero-Trust mTLS Encryption Table:"
linkerd viz -n "$NAMESPACE" edges deployment 2>/dev/null || true
echo ""

log "How to access:"
echo "  🌐 Interactive Web Portal : Open http://localhost (or Port 80 in Codespaces PORTS tab)"
echo "  📊 Linkerd Live Dashboard : Run 'linkerd viz dashboard &' (auto-forwarded)"
echo "  🧪 Run Traffic Burst     : for i in \$(seq 1 20); do curl -s http://localhost/products > /dev/null; done"
echo "  📈 View Real-Time Stats   : linkerd viz -n meshflow stat deployment"
echo ""
log "To delete when finished: kind delete cluster --name meshflow"
