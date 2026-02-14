FROM node:20-slim

WORKDIR /app

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

# Create data directory for SQLite
RUN mkdir -p data

# Rebuild better-sqlite3 for the target OS
RUN npm rebuild better-sqlite3

EXPOSE 3000

CMD ["npx", "ts-node", "index.ts"]
