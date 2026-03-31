# --- Build stage ---
FROM node:20-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- Production stage ---
FROM node:20-slim AS production

WORKDIR /app

# Install only production deps + tsx for running server.ts
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm install tsx

# Copy build output
COPY --from=build /app/dist ./dist

# Copy server entry and source files needed at runtime
COPY server.ts ./
COPY src ./src
COPY ms-shim.mjs ./
COPY public ./public
COPY tsconfig.json ./

# Copy drizzle config + migrations for db:push/migrate if needed
COPY drizzle.config.ts ./
COPY drizzle ./drizzle

EXPOSE 3003

ENV PORT=3003
ENV HOST=0.0.0.0
ENV NODE_ENV=production

CMD ["npx", "tsx", "server.ts"]
