# Ultimate Backend Knowledge Base 🚀

Welcome to the **Backend & Infrastructure Knowledge Base**. This repository is organized as a step-by-step learning guide covering the fundamentals of System Design, Containerization with Docker, and Caching & Job Queuing with Redis and BullMQ.

Each topic is broken down into basic, easy-to-understand explanations with real-world analogies, step-by-step flowcharts, and concrete code or command line examples.

---

## 🗺️ Table of Contents

### 🏛️ 1. System Design (Phase 1)
- [DNS (Domain Name System)](file:///c:/Error/UltimateBackend/docs/system-design/01_dns.md) — *The phonebook of the internet. Translating human-friendly names to IP addresses.*
- [Vertical vs. Horizontal Scaling](file:///c:/Error/UltimateBackend/docs/system-design/02_scaling.md) — *Upgrading a single server vs. adding multiple servers to a pool.*
- [Load Balancers](file:///c:/Error/UltimateBackend/docs/system-design/03_load_balancer.md) — *Distributing network traffic evenly across your server pool.*
- [Caching](file:///c:/Error/UltimateBackend/docs/system-design/04_caching.md) — *Using RAM to speed up read queries and lower database latency.*
- [Database Scaling (Replication & Sharding)](file:///c:/Error/UltimateBackend/docs/system-design/05_database_scaling.md) — *Replicating databases for reads and partitioning (sharding) for writes.*
- [CDNs (Content Delivery Networks)](file:///c:/Error/UltimateBackend/docs/system-design/06_cdn.md) — *Caching static assets globally closer to your end-users.*
- [Communication Protocols](file:///c:/Error/UltimateBackend/docs/system-design/07_communication_protocols.md) — *Comparing HTTP Short Polling, Long Polling, WebSockets, and Server-Sent Events (SSE).*
- [Message Queues](file:///c:/Error/UltimateBackend/docs/system-design/08_message_queues.md) — *Asynchronous communication patterns (Point-to-Point and Pub/Sub).*

---

### 🐳 2. Docker & Containerization
- [Introduction & Architecture](file:///c:/Error/UltimateBackend/docs/docker/01_intro_and_architecture.md) — *Containers vs. Virtual Machines and standardizing software environments.*
- [Basic Docker Commands](file:///c:/Error/UltimateBackend/docs/docker/02_basic_commands.md) — *Daily essential commands: running, stopping, and inspecting containers.*
- [Writing a Dockerfile](file:///c:/Error/UltimateBackend/docs/docker/03_dockerfile.md) — *A line-by-line breakdown of instructions (FROM, WORKDIR, COPY, RUN, CMD).*
- [Port Mapping](file:///c:/Error/UltimateBackend/docs/docker/04_port_mapping.md) — *Exposing isolated container ports to your local host machine.*
- [Docker Networking](file:///c:/Error/UltimateBackend/docs/docker/05_networking.md) — *Connecting multiple containers together using custom networks and service discovery.*
- [Docker Volumes & Data Persistence](file:///c:/Error/UltimateBackend/docs/docker/06_volumes.md) — *Saving data outside of container lifecycles (Bind Mounts vs. Named Volumes).*
- [Docker Compose](file:///c:/Error/UltimateBackend/docs/docker/07_compose.md) — *Orchestrating multi-container systems (Backend, Frontend, Redis) with a single command.*

---

### ⚡ 3. Redis & BullMQ Queues
- [Caching in Node.js with Redis](file:///c:/Error/UltimateBackend/docs/redis-bullmq/01_redis_caching.md) — *Implementing the Cache-Aside pattern in Express controllers with ioredis.*
- [Queues & BullMQ Architecture](file:///c:/Error/UltimateBackend/docs/redis-bullmq/02_bullmq_queues.md) — *The Producer-Consumer architecture and the `maxRetriesPerRequest` ioredis gotcha.*
- [Asynchronous Email Processing Walkthrough](file:///c:/Error/UltimateBackend/docs/redis-bullmq/03_email_worker_example.md) — *Step-by-step flow from API controller (Queue) to backend background listener (Worker).*
# UltimateBackend
