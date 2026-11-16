# MeshFlow — Microservices & Service Mesh Platform

MeshFlow is an enterprise-grade, containerized microservices platform for a high-performance food ordering system. It features database isolation using PostgreSQL schemas, service-isolated GitHub Actions CI/CD with automated Kubernetes deployments, and a Linkerd service mesh delivering zero-trust mTLS encryption and deep observability.

```
meshflow/
├── user-service/         # User registration, JWT authentication & profiles (Port 3001)
├── product-service/      # Menu catalog, pricing & inventory management (Port 3002)
├── order-service/        # Order orchestration with distributed user & stock checks (Port 3003)
├── .github/workflows/    # Service-isolated CI/CD pipelines (User, Product, Order)
├── k8s/                  # Kubernetes manifests (Namespace, Ingress, PostgreSQL)
├── scripts/              # Automated setup & orchestration scripts (K8s, Linkerd, E2E)
├── docker-compose.yml    # Local multi-container development environment
├── kind-config.yaml      # Kind cluster configuration with Ingress port mapping
└── README.md
```

---

## 🏗️ Architecture & Service Mesh Topology

### ASCII Architecture Diagram

```
                             [ External Client / Traffic ]
                                          │
                                    (HTTP Port 80)
                                          ▼
                      ┌───────────────────────────────────────┐
                      │    NGINX Ingress Controller (Kind)    │
                      └───────────────────┬───────────────────┘
                                          │
                   ┌──────────────────────┼──────────────────────┐
            /users │            /products │              /orders │
                   ▼                      ▼                      ▼
        ┌─────────────────────┐┌─────────────────────┐┌─────────────────────┐
        │    User Service     ││   Product Service   ││    Order Service    │
        │  ┌───────────────┐  ││  ┌───────────────┐  ││  ┌───────────────┐  │
        │  │ linkerd-proxy │◄─┼┼─►│ linkerd-proxy │◄─┼┼─►│ linkerd-proxy │  │
        │  └───────┬───────┘  ││  └───────┬───────┘  ││  └───────┬───────┘  │
        │          │          ││          │          ││          │          │
        │    [App Container]  ││    [App Container]  ││    [App Container]  │
        │     (Port 3001)     ││     (Port 3002)     ││     (Port 3003)     │
        └──────────┬──────────┘└──────────┬──────────┘└──────────┬──────────┘
                   │                      │                      │
                   │    (mTLS / Zero-Trust Service Mesh)         │
                   │  ┌───────────────────┴───────────────────┐  │
                   │  │ Order Service validates user via US   │  │
                   │  │ Order Service reserves stock via PS   │  │
                   │  └───────────────────────────────────────┘  │
                   ▼                      ▼                      ▼
         ┌──────────────────────────────────────────────────────────────┐
         │              PostgreSQL Shared Instance (Port 5432)          │
         │  ┌────────────────────┬────────────────────┬──────────────┐  │
         │  │ users_service      │ products_service   │orders_service│  │
         │  │ (users table)      │ (products table)   │(orders,items)│  │
         │  └────────────────────┴────────────────────┴──────────────┘  │
         └──────────────────────────────────────────────────────────────┘
                                          ▲
                                          │ Metrics Scrape (mTLS)
                      ┌───────────────────┴───────────────────┐
                      │    Linkerd Viz (Prometheus & Dashboard)│
                      └───────────────────────────────────────┘
```

---

## 📡 REST API Contracts

### 1. User Service (Port `3001`)
Base Path: `/users`

#### `POST /users/register`
Creates a new user account with bcrypt password hashing.
- **Request Body:**
```json
{
  "name": "Alex Johnson",
  "email": "alex@example.com",
  "password": "Password123!"
}
```
- **Response `201 Created`:**
```json
{
  "message": "User registered successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "name": "Alex Johnson",
    "email": "alex@example.com",
    "createdAt": "2026-11-16T12:00:00.000Z"
  }
}
```

#### `POST /users/login`
Authenticates credentials and returns a signed JWT.
- **Request Body:**
```json
{
  "email": "alex@example.com",
  "password": "Password123!"
}
```
- **Response `200 OK`:**
```json
{
  "message": "Login successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "name": "Alex Johnson",
    "email": "alex@example.com"
  }
}
```

#### `GET /users/:id`
Retrieves public profile for user ID.
- **Headers:** `Authorization: Bearer <token>`
- **Response `200 OK`**

---

### 2. Product Service (Port `3002`)
Base Path: `/products`

#### `GET /products`
Fetches all menu items with active stock.
- **Response `200 OK`:**
```json
[
  {
    "id": 1,
    "name": "Artisan Margherita Pizza",
    "description": "Wood-fired sourdough with San Marzano tomatoes, fresh mozzarella, and basil",
    "price": 14.99,
    "stock": 50
  }
]
```

#### `POST /products`
Adds a new product to the catalog.
- **Request Body:** `{"name": "Truffle Fries", "price": 7.50, "stock": 40}`
- **Response `201 Created`**

#### `PATCH /products/:id/stock`
Atomically adjusts or reserves inventory.
- **Request Body:** `{"quantityChange": -2}`
- **Response `200 OK`**

---

### 3. Order Service (Port `3003`)
Base Path: `/orders`

#### `POST /orders`
Orchestrates order placement:
1. Calls **User Service** (`GET /users/:userId`) to validate user existence.
2. Calls **Product Service** (`GET /products/:id` & `PATCH /products/:id/stock`) to verify stock and deduct quantities.
3. Persists order & order items in `orders_service` schema inside PostgreSQL.

- **Headers:** `Authorization: Bearer <token>` (optional for inter-service, validated if supplied)
- **Request Body:**
```json
{
  "userId": 1,
  "items": [
    { "productId": 1, "quantity": 2 }
  ]
}
```
- **Response `201 Created`:**
```json
{
  "id": 1,
  "userId": 1,
  "totalAmount": 29.98,
  "status": "CONFIRMED",
  "items": [
    {
      "productId": 1,
      "productName": "Artisan Margherita Pizza",
      "unitPrice": 14.99,
      "quantity": 2,
      "subtotal": 29.98
    }
  ]
}
```

#### `GET /orders/:id`
Retrieves order details and item breakdown.

---

## 📋 Prerequisites

Before running from scratch, ensure you have:
- **Git**
- **Node.js 18+** & `npm`
- **Docker Engine** (or Docker Desktop / GitHub Codespaces)
- **kubectl** (`v1.26+`)
- **kind** (`v0.20+`)
- **Linkerd CLI** (`edge-26.11+` or `stable-2.14+`)
- **jq** and **curl** (for CLI testing)

---

## 🚀 Running Everything From Scratch

### Option A: Local Multi-Container Dev (Docker Compose)

Ideal for rapid local development without Kubernetes:

```bash
# 1. Start all 3 microservices and PostgreSQL
docker compose up --build -d

# 2. Run unit tests
npm test

# 3. Run end-to-end integration tests
npm run test:e2e

# 4. Stop environment
docker compose down -v
```

---

### Option B: Local Kubernetes Deployment (Kind + Ingress)

Deploys the entire production-like cluster onto Kind with NGINX Ingress:

```bash
# 1. Run the automated Kubernetes setup script
bash scripts/k8s-setup.sh
# (On Windows PowerShell: .\scripts\k8s-setup.ps1)

# 2. Verify all pods and ingress are running
kubectl get pods -n meshflow
kubectl get ingress -n meshflow
```

Test endpoints through Ingress:
```bash
# View menu
curl -s http://localhost/products | jq

# Register user
curl -s http://localhost/users/register \
  -X POST -H "Content-Type: application/json" \
  -d '{"name":"Alex","email":"alex@example.com","password":"Password123!"}' | jq
```

---

### Option C: Service Mesh & mTLS (Linkerd)

Injects Linkerd sidecars into every pod, enables mutual TLS (mTLS), and spins up real-time observability:

```bash
# 1. Run Linkerd setup script
bash scripts/linkerd-setup.sh

# 2. Add linkerd to your PATH
export PATH="$HOME/.linkerd2/bin:$PATH"

# 3. Inspect meshed pods (Notice 2/2 containers: App + Proxy)
kubectl get pods -n meshflow

# 4. Verify mTLS encryption between services
linkerd viz -n meshflow edges deployment

# 5. Monitor live throughput & latency
linkerd viz -n meshflow stat deployment

# 6. Launch real-time visual dashboard
linkerd viz dashboard &
```

---

## 🧪 Resilience & Chaos Testing

Test Kubernetes self-healing and Linkerd traffic resilience under pod failure:

```bash
# 1. Terminate an active user-service pod
POD_NAME=$(kubectl get pod -n meshflow -l app=user-service -o jsonpath='{.items[0].metadata.name}')
kubectl delete pod -n meshflow $POD_NAME

# 2. Immediately observe replacement
kubectl get pods -n meshflow
```

*Result:* Kubernetes spins up an immediate replacement pod with the Linkerd sidecar injected automatically. Traffic continues to be routed to healthy replicas with zero downtime.

---

## 🔄 CI/CD Pipelines (GitHub Actions)

MeshFlow implements path-filtered, service-isolated CI/CD workflows:
- `.github/workflows/user-ci.yaml`
- `.github/workflows/product-ci.yaml`
- `.github/workflows/order-ci.yaml`

### How the Pipeline Works:
1. **Trigger**: Triggers automatically on push/PR only when files within the service's folder change.
2. **Testing**: Runs Jest unit test suites in a clean Node 18 environment.
3. **Build & Push**: Builds multi-stage production Docker images and publishes them to Docker Hub with tags `:latest` and `:${{ github.sha }}`.
4. **Continuous Deployment (CD)**:
   - Uses `kubectl set image deployment/<service> <service>=<image>:${{ github.sha }} -n meshflow` to trigger zero-downtime rolling updates on the target cluster.
   - Monitors rollout status with `kubectl rollout status`.

### Required GitHub Secrets:
To enable automated container publishing and deployment, set these repository secrets:
- `DOCKERHUB_USERNAME`: Your Docker Hub account username.
- `DOCKERHUB_TOKEN`: Personal Access Token with write permissions.
- `KUBECONFIG`: *(Optional for remote cluster)* Base64-encoded or raw `kubeconfig` file for remote cluster deployment. If omitted, the CD step logs an informative skip notice without failing the CI pipeline.

---

## 🧹 Teardown

To cleanly remove all local resources:

```bash
# Delete the Kind cluster
kind delete cluster --name meshflow
```
