# Build stage for Frontend
FROM node:20 AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Build stage for Backend and Final Image
FROM node:20-slim
WORKDIR /app

# Install build dependencies for better-sqlite3 (needed for some architectures/versions)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Copy backend package files
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm install

# Copy backend source
COPY server/ .
COPY schema.sql .
COPY schema.sql /app/

# Copy built frontend from Stage 1
COPY --from=frontend-builder /app/dist /app/dist

# Create data directory for SQLite
RUN mkdir -p /app/server/data

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Start the server (assuming it uses the dist path for static files)
CMD ["npx", "ts-node", "index.ts"]
