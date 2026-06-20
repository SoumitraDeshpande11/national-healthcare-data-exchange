FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
COPY services/portal/package.json services/portal/package.json
RUN npm install
COPY services/portal ./services/portal
RUN npm --workspace services/portal run build

FROM nginx:1.27-alpine
COPY services/portal/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/services/portal/dist /usr/share/nginx/html
EXPOSE 80
