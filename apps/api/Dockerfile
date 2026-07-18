FROM node:20-alpine AS build

WORKDIR /app

COPY apps/api/package*.json ./apps/api/
COPY package*.json ./
COPY tsconfig*.json ./
COPY apps/api ./apps/api

RUN npm install
RUN cd apps/api && npm install

# Build NestJS
RUN cd apps/api && npm run build

# ---- Runtime stage ----
FROM node:20-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package*.json ./

RUN npm install --omit=dev

# NestJS expose port
EXPOSE 3001

CMD ["node", "dist/main.js"]