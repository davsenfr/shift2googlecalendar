FROM node:22-alpine AS dependencies

WORKDIR /app

# npm workspaces need the root lockfile and every workspace manifest.
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci


FROM dependencies AS development

ENV NODE_ENV=development

COPY apps/api ./apps/api

WORKDIR /app/apps/api

EXPOSE 3001

CMD ["npm", "run", "dev"]


FROM dependencies AS build

COPY apps/api ./apps/api
RUN npm run build --workspace=@shift-to-gc/api


FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Install only the API's production dependencies from the workspace lockfile.
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci --omit=dev --workspace=@shift-to-gc/api

COPY --from=build /app/apps/api/dist ./apps/api/dist

WORKDIR /app/apps/api

EXPOSE 3001

CMD ["node", "dist/main.js"]
