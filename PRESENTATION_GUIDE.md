# MeshFlow — Project Presentation & Live Demo Guide

This guide provides a structured, step-by-step walkthrough for presenting **MeshFlow** to evaluators, professors, or technical interviewers. It includes a 60-second elevator pitch, an architecture breakdown, an exact live demonstration script with terminal commands, and common Q&A answers.

---

## 🎙️ Part 1: The 60-Second Elevator Pitch

> *"Good morning/afternoon everyone. Today I'm presenting **MeshFlow** — an enterprise-grade, cloud-native microservices platform for an online food-ordering system.*
>
> *Building microservices is easy, but running them reliably in production is hard. MeshFlow solves the three hardest problems in distributed systems:*
> 1. ***Data Isolation***: *Independent database schemas per service to prevent tight coupling.*
> 2. ***Automated CI/CD***: *Service-isolated pipelines that independently test, build, and deploy changes with zero downtime.*
> 3. ***Zero-Trust Security & Observability***: *A Linkerd service mesh that provides transparent mutual TLS (mTLS) encryption and live telemetry between microservices without changing a single line of application code.*
>
> *Let me walk you through how the system works, followed by a live demonstration."*

---

## 🏗️ Part 2: Workflow & Architecture Overview

Refer to this diagram while explaining the 5 foundational pillars:

```
                            [ External Client ]
                                     │ (HTTP Port 80)
                                     ▼
                      ┌──────────────────────────────┐
                      │    NGINX Ingress Controller  │
                      └──────────────┬───────────────┘
                                     │
           ┌─────────────────────────┼─────────────────────────┐
    /users │               /products │                 /orders │
           ▼                         ▼                         ▼
   ┌───────────────┐         ┌───────────────┐         ┌───────────────┐
   │ User Service  │         │Product Service│         │ Order Service │
   │ ┌───────────┐ │         │ ┌───────────┐ │         │ ┌───────────┐ │
   │ │linkerd-prx│◄┼─────────┼─►linkerd-prx│◄┼─────────┼─►linkerd-prx│ │
   │ └─────┬─────┘ │         │ └─────┬─────┘ │         │ └─────┬─────┘ │
   │   (Port 3001) │         │   (Port 3002) │         │   (Port 3003) │
   └───────┬───────┘         └───────┬───────┘         └───────┬───────┘
           │                         │                         │
           │       (Zero-Trust mTLS Inter-Service Mesh)        │
           │   ┌───────────────────────────────────────────┐   │
           │   │ Order Service calls User Svc (validate)   │   │
           │   │ Order Service calls Product Svc (deduct)  │   │
           │   └───────────────────────────────────────────┘   │
           ▼                         ▼                         ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │                   PostgreSQL Database (Shared Instance)             │
  │   [Schema: users_service]  [Schema: products_service]  [Schema: ..] │
  └─────────────────────────────────────────────────────────────────────┘
```

### 1. The Microservices
- **User Service (Port 3001)**: User registration, bcrypt password hashing, and signed JWT authentication.
- **Product Service (Port 3002)**: Food catalog, pricing, and atomic stock adjustment.
- **Order Service (Port 3003) — The Orchestrator**: Coordinates orders. It calls User Service to validate customer existence and Product Service to check stock and reserve items before confirming orders.

### 2. Schema-per-Service Database Pattern
- Instead of provisioning 3 separate database engines, MeshFlow uses a **single PostgreSQL instance with 3 isolated schemas**: `users_service`, `products_service`, and `orders_service`.
- This provides logical table boundary isolation with minimal resource overhead.

### 3. Kubernetes & Ingress Layer
- Runs on a local **Kind** Kubernetes cluster.
- **NGINX Ingress Controller** exposes port `80` and routes traffic by prefix (`/users`, `/products`, `/orders`) to internal ClusterIP services.
- Microservices discover one another using internal Kubernetes DNS (`user-service.meshflow.svc.cluster.local`).

### 4. Service Mesh Layer (Linkerd)
- Injected sidecars: Each pod contains both the **Application container** and a lightweight **Linkerd micro-proxy**.
- **Automatic mTLS**: Traffic between services is automatically encrypted with mutual TLS using short-lived certificates.
- **Observability**: Real-time Golden Metrics (Traffic Rate, Error Rates, Latency percentiles) are scraped without application code modification.

### 5. Automated CI/CD (GitHub Actions)
- Monorepo with path-based triggering: changing only `order-service/` triggers only `order-ci.yaml`.
- Steps: **Jest unit tests** $\rightarrow$ **Multi-stage Docker build** $\rightarrow$ **Publish to Docker Hub** $\rightarrow$ **Rolling update via `kubectl set image`**.

---

## 💻 Part 3: Live Demonstration Script

Have your terminal open (in GitHub Codespaces or your local environment). Run these commands in order:

### Pre-Demo Check (Run before presenting)
Ensure `linkerd` is on your path:
```bash
export PATH="$HOME/.linkerd2/bin:$PATH"
```

---

### Act 1: The Running Cluster & Sidecar Injection
**What to say:**
> *"First, let's inspect our Kubernetes cluster in the `meshflow` namespace."*

**Command:**
```bash
kubectl get pods -n meshflow -o wide
```

**Key Points to Highlight:**
- Every pod shows **`READY: 2/2`**.
- Explain: *"Notice that each pod runs two containers: our Node.js microservice and the injected Linkerd proxy sidecar. We also run 2 replicas per service for high availability."*

---

### Act 2: Interactive Web Portal & End-to-End Business Flow
**What to say:**
> *"We built an interactive, dark-mode frontend portal that connects directly to the NGINX Ingress controller at `http://localhost/` so you can visually experience the entire distributed system in action."*

#### Option A: Visual Web Demonstration (Recommended for Presentations!)
1. Open `http://localhost/` in your browser (In Codespaces, click the forwarded Port 80 notification or open port 80 in the PORTS tab).
2. **Point out the Live Health Indicators** in the top bar: User Service (:3001), Product Service (:3002), and Order Service (:3003).
3. **1-Click Authentication**:
   - The portal auto-signs in with `test@example.com` or click **"Register New"**.
   - Show the active JWT Token and user profile card.
4. **Browse & Add Items to Cart**:
   - Show live product cards loaded dynamically from `products_service` PostgreSQL schema.
   - Click `+ Add` on **Artisan Margherita Pizza** and **Crispy Truffle Fries**.
5. **Click "Place Order via Orchestrator"**:
   - Watch the **Distributed Trace Timeline** light up step-by-step:
     1. Ingress receives `POST /orders`
     2. Order Service $\rightarrow$ User Service (`GET /users/:id`) [🔒 mTLS Verified]
     3. Order Service $\rightarrow$ Product Service (`PATCH /products/:id/stock`) [🔒 mTLS Verified]
     4. PostgreSQL commits to `orders_service` schema
   - Point out that the product stock instantly decrements on screen, and the new order appears in the **Completed Orders** list!
6. **Live Traffic Burst**: Click the **"Send 15 Test Requests"** button in the header to instantly generate traffic for Linkerd Viz.

#### Option B: Terminal CLI Demonstration (curl)
If demonstrating via the terminal:

##### 2a. Browse the Menu Catalog (Product Service)
```bash
curl -s http://localhost/products | jq
```
*Point out: The menu items and their stock levels (e.g., Margherita Pizza with starting stock).*

#### 2b. Register & Authenticate a Customer (User Service)
```bash
# Register
curl -s http://localhost/users/register \
  -X POST -H "Content-Type: application/json" \
  -d '{"name":"Demo User","email":"demo@meshflow.io","password":"SecurePassword123!"}' | jq

# Login and capture JWT Token
TOKEN=$(curl -s http://localhost/users/login \
  -X POST -H "Content-Type: application/json" \
  -d '{"email":"demo@meshflow.io","password":"SecurePassword123!"}' | jq -r '.token')

echo "JWT Token: $TOKEN"
```
*Point out: Password hashed with bcrypt, JWT token returned.*

#### 2c. Place an Order (Distributed Orchestration)
**What to say:**
> *"When I place this order, Order Service will talk to User Service to validate the customer, then call Product Service to deduct stock, and finally save the order in Postgres."*

```bash
curl -s http://localhost/orders \
  -X POST -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"userId":1,"items":[{"productId":1,"quantity":2}]}' | jq
```
*Point out: The order is `CONFIRMED` with computed total.*

#### 2d. Verify Stock Deduction
```bash
curl -s http://localhost/products | jq '.[0]'
```
*Point out: Stock for Margherita Pizza was automatically decremented by 2!*

---

### Act 3: Zero-Trust Security (Live mTLS Verification)
**What to say:**
> *"In a zero-trust architecture, internal network traffic must be encrypted. Let's inspect the live encryption status between our microservices."*

**Command:**
```bash
linkerd viz -n meshflow edges deployment
```

**Key Points to Highlight:**
- Look at the **`SECURED √`** column.
- Highlight:
  - `order-service` $\rightarrow$ `user-service`: **`SECURED √`**
  - `product-service` $\rightarrow$ `postgres`: **`SECURED √`**
- Say: *"Without writing a single line of TLS/SSL certificate code in Node.js, Linkerd automatically encrypts all service-to-service payloads using mutual TLS."*

---

### Act 4: Live Telemetry & Observability
**What to say:**
> *"Let's generate real-time traffic and look at the Golden Metrics: Rate, Errors, and Duration."*

**Command:**
```bash
# Generate 20 requests
for i in $(seq 1 20); do curl -s http://localhost/products > /dev/null; done

# Check real-time stats
linkerd viz -n meshflow stat deployment
```

**Key Points to Highlight:**
- **Success Rate**: 100.00%
- **RPS**: Real-time throughput
- **Latency**: P50, P95, and P99 latency percentiles tracked at the sidecar level.
- *(Optional)*: Show the visual dashboard with `linkerd viz dashboard &`.

---

### Act 5: Self-Healing & Resilience Test
**What to say:**
> *"What happens when a container crashes in production? Let's simulate a sudden failure by forcibly deleting an active user-service pod."*

**Command:**
```bash
# 1. Kill one user-service pod
POD_NAME=$(kubectl get pod -n meshflow -l app=user-service -o jsonpath='{.items[0].metadata.name}')
echo "Simulating crash of pod: $POD_NAME"
kubectl delete pod -n meshflow $POD_NAME

# 2. Check pods immediately
kubectl get pods -n meshflow
```

**Key Points to Highlight:**
- Kubernetes immediately schedules a replacement pod.
- Linkerd automatically attaches the sidecar.
- Because `user-service` has 2 replicas, all ongoing client requests continue to succeed with **zero downtime**.

---

### Act 6: Continuous Deployment (CI/CD Pipeline)
**What to say:**
> *"All of this is supported by our automated CI/CD pipeline."*

- Show `.github/workflows/order-ci.yaml`:
  1. Triggered on folder changes.
  2. Runs automated unit tests (`npm test`).
  3. Builds multi-stage Docker image and pushes to Docker Hub.
  4. Triggers zero-downtime rolling update via `kubectl set image`.

---

## ❓ Part 4: Likely Viva / Panel Questions & Answers

| Question | Recommended Answer |
|---|---|
| **Why Linkerd instead of Istio?** | *"Linkerd is ultra-lightweight and purpose-built in Rust and Go. Unlike Istio, which is resource-heavy and complex to configure with Envoy, Linkerd has a minimal memory footprint (~30MB), zero configuration for automatic mTLS, and comes with Linkerd Viz out-of-the-box."* |
| **Why one Postgres database instead of 3 separate databases?** | *"We adopted the 'Schema-per-Service' pattern. It provides strict table and schema isolation without the overhead and memory costs of running three separate DBMS instances in local/testing environments."* |
| **How does mTLS work if the app doesn't know about it?** | *"The `linkerd-proxy` runs as a sidecar container in the same Linux network namespace. All incoming and outgoing TCP packets are intercepted via `iptables`. The sidecars establish a TLS handshake with mutual certificate verification before proxying plaintext traffic to `localhost` inside the pod."* |
| **How do microservices find each other in Kubernetes?** | *"Through Kubernetes CoreDNS. For example, Order Service calls `http://user-service.meshflow.svc.cluster.local:3001`. Kubernetes resolves this to the Service's ClusterIP and load-balances across the pod endpoints."* |
| **Why multi-stage Docker builds?** | *"Stage 1 uses full npm tooling to build dependencies, while Stage 2 copies only production `node_modules` into a stripped-down Alpine image running as an unprivileged non-root `node` user for security and minimal image size."* |
| **How does Kubernetes ensure zero-downtime deployments?** | *"Through Rolling Updates coupled with Liveness and Readiness Probes. Kubernetes keeps old pods alive until new pods pass their readiness health checks (`/health`), preventing traffic from hitting unready instances."* |
