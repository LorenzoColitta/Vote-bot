# Build stage
FROM node:24-bullseye-slim AS build
WORKDIR /app

# Copy package files first so the dependency layer can cache
COPY package*.json ./

# Install deps but do NOT run lifecycle scripts (postinstall) yet
RUN npm install --no-audit --no-fund --ignore-scripts

# Now copy source (including tsconfig.json) and run the build
COPY . .
RUN npm run build

# Production stage
FROM node:24-bullseye-slim AS prod
WORKDIR /app
ENV NODE_ENV=production

# Copy package files and install only production deps, do not run lifecycle scripts
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund --ignore-scripts

# Copy built artifacts
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/index.js"]
