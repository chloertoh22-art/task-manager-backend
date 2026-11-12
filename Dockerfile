# Container image for the Task Manager API.
# Build:  docker build --platform linux/amd64 -t task-api .
# Run:    docker compose up --build   (starts MySQL + the API, see docker-compose.yml)

# Small official Node.js 24 image based on Alpine Linux
FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

# 1. Install dependencies first. Docker caches this layer, so it only
#    re-runs when package.json or package-lock.json change.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 2. Copy the application code (see .dockerignore for what is left out)
COPY src ./src
COPY db ./db
COPY certs ./certs

# 3. Don't run as root: use the unprivileged "node" user from the base image
USER node

EXPOSE 3000
CMD ["node", "src/server.js"]
