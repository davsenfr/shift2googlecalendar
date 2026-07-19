# ---- Build stage ----
FROM node:22-alpine AS build

WORKDIR /app

# 1. Copier la config racine (workspaces)
COPY package.json package-lock.json ./
RUN npm ci

# 2. Copier tout le projet
COPY . .

# 3. Se placer dans le workspace API
WORKDIR /app/apps/api

# 4. Installer les deps du workspace API
RUN npm ci

# 5. Build le backend
RUN npm run build


# ---- Runtime stage ----
FROM node:22-alpine AS runtime

WORKDIR /app/apps/api

ENV NODE_ENV=production

# 6. Copier le package.json et le build depuis le stage build
COPY apps/api/package.json ./package.json
# (facultatif si tu as un package-lock.json spécifique à l'API)
# COPY apps/api/package-lock.json ./package-lock.json
COPY --from=build /app/apps/api/dist ./dist

# 7. Installer les deps en runtime (prod)
RUN npm ci --omit=dev

EXPOSE 3001

CMD ["node", "dist/main.js"]