# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files for main app
COPY package*.json ./

# Copy web package files
COPY src/web/package*.json ./src/web/

# Install all dependencies (including web)
RUN npm ci && cd src/web && npm ci

# Copy source files
COPY tsconfig.json ./
COPY src ./src

# Build API
RUN npm run build:api

# Build Web
RUN npm run build:web

# Production stage
FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only (skip postinstall)
RUN npm ci --omit=dev --ignore-scripts

# Copy built files
COPY --from=builder /app/dist ./dist

# Create non-root user
RUN addgroup -g 1001 -S ajaas && \
    adduser -S ajaas -u 1001 -G ajaas

USER ajaas

EXPOSE 3000

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

CMD ["node", "dist/entrypoints/node.js"]
