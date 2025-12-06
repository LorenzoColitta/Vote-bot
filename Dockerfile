# Build stage
FROM node:24-bullseye-slim AS build
WORKDIR /app

# copy package json first for layer caching
COPY package*.json ./

# install dev deps so tsc is available for the build
RUN npm install --no-audit --no-fund

# copy source and build
COPY . .
RUN npm run build

# Production stage
FROM node:24-bullseye-slim AS prod
WORKDIR /app
ENV NODE_ENV=production

# Copy only package files and install production deps.
COPY package*.json ./

# Install only production deps and DO NOT run lifecycle scripts (pre/postinstall)
# --ignore-scripts prevents postinstall (which would try to run tsc)
RUN npm install --omit=dev --no-audit --no-fund --ignore-scripts

# Copy built artifacts
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/index.js"]
