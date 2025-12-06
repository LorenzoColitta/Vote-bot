# Build stage
FROM node:24-bullseye-slim AS build
WORKDIR /app

# copy package files so install can cache
COPY package*.json ./

# install dependencies but do NOT run lifecycle scripts (postinstall)
RUN npm install --no-audit --no-fund --ignore-scripts

# copy source (including tsconfig.json) and run the build
COPY . .
RUN npm run build

# Production stage
FROM node:24-bullseye-slim AS prod
WORKDIR /app
ENV NODE_ENV=production

# copy only package files for prod deps install
COPY package*.json ./

# install only production deps and do not run lifecycle scripts
RUN npm install --omit=dev --no-audit --no-fund --ignore-scripts

# copy built JS
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/index.js"]
