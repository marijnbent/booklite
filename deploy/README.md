# Deployment Files

- `compose.yml` runs the production-like single-container stack.
- `compose.dev.yml` runs API and web in separate dev containers with bind mounts.

From repo root:

```bash
docker compose -f deploy/compose.yml up -d --build
docker compose -f deploy/compose.dev.yml up
```
