# --- build stage: compile the Angular app (production config) ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# `npm run build` uses the production configuration (defaultConfiguration in
# angular.json), which applies the environment.prod.ts fileReplacement.
RUN npm run build

# --- serve stage: static files behind nginx ---
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/emulador/browser /usr/share/nginx/html
EXPOSE 80
