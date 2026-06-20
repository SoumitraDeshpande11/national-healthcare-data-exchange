FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY services/exchange-api/package.json services/exchange-api/package.json
RUN npm install

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY services/exchange-api ./services/exchange-api
RUN npm --workspace services/exchange-api run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
COPY services/exchange-api/package.json services/exchange-api/package.json
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/services/exchange-api/dist ./services/exchange-api/dist
EXPOSE 8080
CMD ["node", "services/exchange-api/dist/server.js"]
