# ==================================================================
# MeshFlow — Kubernetes Setup Script (Kind) — PowerShell Edition
# ==================================================================
# This script sets up a local Kind cluster, installs the NGINX
# Ingress Controller, deploys PostgreSQL and all three microservices,
# and verifies the full system is running.
#
# Prerequisites:
#   - Docker Desktop running
#   - kind installed (winget install Kubernetes.kind)
#   - kubectl installed
#
# Usage (from project root):
#   .\scripts\k8s-setup.ps1
# ==================================================================

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$ClusterName = "meshflow"
$Namespace   = "meshflow"

function Log   { param($msg) Write-Host "[MeshFlow] $msg" -ForegroundColor Cyan }
function Ok    { param($msg) Write-Host "[  OK  ] $msg" -ForegroundColor Green }
function Warn  { param($msg) Write-Host "[ WARN ] $msg" -ForegroundColor Yellow }
function Fail  { param($msg) Write-Host "[ FAIL ] $msg" -ForegroundColor Red; exit 1 }

# ---- Step 1: Preflight Checks ----
Log "Running preflight checks..."

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Fail "Docker is not installed." }

$dockerInfo = docker info 2>&1
if ($LASTEXITCODE -ne 0) { Fail "Docker daemon is not running. Start Docker Desktop first." }

if (-not (Get-Command kind -ErrorAction SilentlyContinue)) { Fail "Kind is not installed. Run: winget install Kubernetes.kind" }
if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) { Fail "kubectl is not installed." }

Ok "All prerequisites satisfied."

# ---- Step 2: Create Kind Cluster ----
$existingClusters = kind get clusters 2>&1
if ($existingClusters -match "^$ClusterName$") {
    Warn "Kind cluster '$ClusterName' already exists. Deleting and recreating..."
    kind delete cluster --name $ClusterName
}

Log "Creating Kind cluster '$ClusterName' with port mappings..."
kind create cluster --name $ClusterName --config "$ProjectDir\kind-config.yaml"
if ($LASTEXITCODE -ne 0) { Fail "Failed to create Kind cluster." }
Ok "Kind cluster created."

# ---- Step 3: Install NGINX Ingress Controller ----
Log "Installing NGINX Ingress Controller for Kind..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

Log "Waiting for Ingress Controller to be ready (up to 120s)..."
kubectl wait --namespace ingress-nginx `
    --for=condition=ready pod `
    --selector=app.kubernetes.io/component=controller `
    --timeout=120s
Ok "NGINX Ingress Controller is ready."

# ---- Step 4: Load Docker Images into Kind ----
Log "Loading Docker images into Kind cluster..."

$images = @(
    "abhijeetsoni08/meshflow-user-service:latest",
    "abhijeetsoni08/meshflow-product-service:latest",
    "abhijeetsoni08/meshflow-order-service:latest"
)

foreach ($img in $images) {
    $inspect = docker image inspect $img 2>&1
    if ($LASTEXITCODE -eq 0) {
        kind load docker-image $img --name $ClusterName
        Ok "Loaded $img"
    } else {
        Warn "$img not found locally. Kind will try to pull from Docker Hub."
    }
}

# ---- Step 5: Deploy K8s Resources ----
Log "Deploying MeshFlow to Kubernetes..."

# Namespace
kubectl apply -f "$ProjectDir\k8s\namespace.yaml"
Ok "Namespace '$Namespace' created."

# PostgreSQL
kubectl apply -f "$ProjectDir\k8s\postgres.yaml"
Ok "PostgreSQL manifests applied."

Log "Waiting for PostgreSQL pod to be ready..."
kubectl wait --namespace $Namespace `
    --for=condition=ready pod `
    --selector=app=postgres `
    --timeout=120s
Ok "PostgreSQL is ready."

# Microservices
$services = @("user-service", "product-service", "order-service")
foreach ($svc in $services) {
    kubectl apply -f "$ProjectDir\$svc\k8s\deployment.yaml"
    kubectl apply -f "$ProjectDir\$svc\k8s\service.yaml"
    Ok "Deployed $svc."
}

# Frontend UI Portal
kubectl create configmap frontend-html `
    --from-file=index.html="$ProjectDir\frontend\index.html" `
    --namespace $Namespace `
    --dry-run=client -o yaml | kubectl apply -f -
kubectl apply -f "$ProjectDir\frontend\k8s\deployment.yaml"
kubectl apply -f "$ProjectDir\frontend\k8s\service.yaml"
Ok "Deployed frontend portal."

# Ingress
kubectl apply -f "$ProjectDir\k8s\ingress.yaml"
Ok "Ingress rules applied."

# ---- Step 6: Wait for All Pods ----
Log "Waiting for all microservice pods to be ready (up to 180s)..."
$allServices = @("user-service", "product-service", "order-service", "frontend")
foreach ($svc in $allServices) {
    kubectl wait --namespace $Namespace `
        --for=condition=ready pod `
        --selector=app=$svc `
        --timeout=180s
    Ok "$svc pods are ready."
}

# ---- Step 7: Final Status ----
Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "  MeshFlow is running on Kubernetes!  " -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
kubectl get pods -n $Namespace
Write-Host ""
kubectl get svc -n $Namespace
Write-Host ""
kubectl get ingress -n $Namespace
Write-Host ""
Log "Test it out:"
Write-Host '  curl http://localhost/products'
Write-Host '  curl http://localhost/users/register -X POST -H "Content-Type: application/json" -d "{\"name\":\"Test\",\"email\":\"test@test.com\",\"password\":\"Pass123!\"}"'
Write-Host ""
Log "To tear down: kind delete cluster --name $ClusterName"
