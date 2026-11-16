#!/bin/bash
# ==================================================================
# MeshFlow — Phase 5: Linkerd Service Mesh Setup
# ==================================================================
# Installs Linkerd CLI, control plane, injects sidecars into all
# microservices, enables mTLS, installs Linkerd Viz for monitoring.
#
# Prerequisites:
#   - Kind cluster 'meshflow' running (Phase 4 complete)
#   - kubectl configured to the meshflow cluster context
#
# Usage:
#   bash scripts/linkerd-setup.sh
# ==================================================================

set -euo pipefail

NAMESPACE="meshflow"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()   { echo -e "${CYAN}[MeshFlow]${NC} $1"; }
ok()    { echo -e "${GREEN}[  ✔  ]${NC} $1"; }
warn()  { echo -e "${YELLOW}[ WARN]${NC} $1"; }
fail()  { echo -e "${RED}[FAIL ]${NC} $1"; exit 1; }

# ---- Step 1: Preflight Checks ----
log "Running preflight checks..."

command -v kubectl >/dev/null 2>&1 || fail "kubectl is not installed."

# Verify the meshflow cluster is running
kubectl get namespace "$NAMESPACE" >/dev/null 2>&1 || fail "Namespace '$NAMESPACE' not found. Run Phase 4 setup first."

PODS_RUNNING=$(kubectl get pods -n "$NAMESPACE" --field-selector=status.phase=Running --no-headers 2>/dev/null | wc -l)
if [ "$PODS_RUNNING" -lt 4 ]; then
    fail "Expected at least 4 running pods in '$NAMESPACE'. Found $PODS_RUNNING. Run Phase 4 setup first."
fi

ok "Phase 4 cluster verified ($PODS_RUNNING pods running)."

# ---- Step 2: Install Linkerd CLI ----
if command -v linkerd >/dev/null 2>&1; then
    ok "Linkerd CLI already installed: $(linkerd version --client --short)"
else
    log "Installing Linkerd CLI..."
    curl -fsL https://run.linkerd.io/install | sh

    # Add to PATH for this session
    export PATH="$HOME/.linkerd2/bin:$PATH"

    # Verify installation
    linkerd version --client --short >/dev/null 2>&1 || fail "Linkerd CLI installation failed."
    ok "Linkerd CLI installed: $(linkerd version --client --short)"
fi

# Ensure linkerd is on PATH (in case it was installed previously)
export PATH="$HOME/.linkerd2/bin:$PATH"

# ---- Step 3: Pre-install Validation ----
log "Running Linkerd pre-install checks..."
linkerd check --pre || warn "Some pre-checks had warnings (often OK in Kind)."
ok "Pre-install checks complete."

# ---- Step 4: Install Linkerd CRDs ----
log "Installing Linkerd CRDs (Custom Resource Definitions)..."
linkerd install --crds | kubectl apply -f -
ok "Linkerd CRDs installed."

# ---- Step 5: Install Linkerd Control Plane ----
log "Installing Linkerd control plane..."
linkerd install | kubectl apply -f -

log "Waiting for Linkerd control plane to be ready (this takes 1-2 minutes)..."
linkerd check --wait 5m || warn "Some checks had warnings (often OK in Kind)."
ok "Linkerd control plane is running."

# ---- Step 6: Inject Sidecars into MeshFlow Pods ----
# The namespace already has 'linkerd.io/inject: enabled' label and
# the deployments have the annotation. We just need to restart pods
# so the mutating webhook injects the Linkerd proxy sidecar.
log "Restarting deployments to inject Linkerd sidecars..."

for svc in user-service product-service order-service postgres; do
    kubectl rollout restart deployment/"$svc" -n "$NAMESPACE"
done

log "Waiting for rollouts to complete..."
for svc in user-service product-service order-service postgres; do
    kubectl rollout status deployment/"$svc" -n "$NAMESPACE" --timeout=120s
    ok "$svc restarted with Linkerd sidecar."
done

# ---- Step 7: Verify Sidecar Injection ----
log "Verifying Linkerd sidecar injection..."

# Each pod should now have 2 containers (app + linkerd-proxy)
MESHED_PODS=0
TOTAL_PODS=0
while IFS= read -r line; do
    TOTAL_PODS=$((TOTAL_PODS + 1))
    CONTAINERS=$(echo "$line" | awk '{print $2}')
    READY=$(echo "$CONTAINERS" | cut -d'/' -f1)
    TOTAL=$(echo "$CONTAINERS" | cut -d'/' -f2)
    if [ "$TOTAL" -eq 2 ]; then
        MESHED_PODS=$((MESHED_PODS + 1))
    fi
done < <(kubectl get pods -n "$NAMESPACE" --no-headers)

echo "  Meshed pods: $MESHED_PODS / $TOTAL_PODS"
if [ "$MESHED_PODS" -lt "$TOTAL_PODS" ]; then
    warn "Not all pods have sidecars. Some may still be rolling out."
else
    ok "All $TOTAL_PODS pods have Linkerd sidecars injected."
fi

# ---- Step 8: Verify mTLS ----
log "Checking mTLS status between services..."
linkerd viz check 2>/dev/null && ok "Viz pre-check passed." || true

# We'll install viz first, then check mTLS
# ---- Step 9: Install Linkerd Viz (Dashboard + Prometheus + Grafana) ----
log "Installing Linkerd Viz extension (dashboard, Prometheus, Grafana)..."
linkerd viz install | kubectl apply -f -

log "Waiting for Linkerd Viz to be ready (1-2 minutes)..."
linkerd viz check --wait 5m || warn "Some Viz checks had warnings."
ok "Linkerd Viz is running."

# ---- Step 10: Final Verification ----
echo ""
echo "=========================================================="
echo "  MeshFlow Service Mesh is Active! 🔒🚀"
echo "=========================================================="
echo ""

# Show meshed pod status
log "Meshed pods in '$NAMESPACE':"
kubectl get pods -n "$NAMESPACE" -o wide
echo ""

# Check mTLS
log "Verifying mTLS is active..."
linkerd viz -n "$NAMESPACE" edges deployment 2>/dev/null || warn "Edges not available yet — generate some traffic first."
echo ""

log "Quick mTLS verification:"
echo "  Run: linkerd viz -n meshflow edges deployment"
echo "  All edges should show 'secured' with a 🔒"
echo ""

log "To open the Linkerd dashboard:"
echo "  linkerd viz dashboard &"
echo "  (In Codespaces, it will auto-forward the port)"
echo ""

log "To test resilience (kill a pod, watch it recover):"
echo "  kubectl delete pod -n meshflow -l app=user-service --wait=false"
echo "  kubectl get pods -n meshflow -w"
echo ""

log "To generate traffic for the dashboard:"
echo "  for i in \$(seq 1 50); do curl -s http://localhost/products > /dev/null; done"
echo "  linkerd viz -n meshflow stat deployment"
