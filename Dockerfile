FROM node:20.19.5-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html app.js styles.css ./
COPY scripts/ ./scripts/
RUN npm run check && node scripts/prepare-image.js

FROM nginx:1.27.5-alpine
COPY --from=build /app/public/ /usr/share/nginx/html/
EXPOSE 80
