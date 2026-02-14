FROM node:20-slim

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev for building)
RUN npm install

# Copy source
COPY . .

# Build TypeScript to JavaScript
RUN npm run build || (echo "No build script, continuing with ts-node if needed")

# Create data directory for SQLite
RUN mkdir -p data

EXPOSE 3000

# Use index.ts with ts-node if not built, otherwise index.js
CMD ["npx", "ts-node", "index.ts"]
