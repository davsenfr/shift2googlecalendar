FROM node:20-alpine AS build

WORKDIR /app

COPY apps/web/package*.json ./apps/web/
COPY package*.json ./
COPY apps/web ./apps/web

RUN npm install
RUN cd apps/web && npm install

# Build Vite
RUN cd apps/web && npm run build

# ---- Runtime stage ----
FROM nginx:1.27-alpine AS runtime

WORKDIR /usr/share/nginx/html

# Copy Vite build (default apps/web/dist)
COPY --from=build /app/apps/web/dist ./

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]