# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package*.json ./
RUN npm ci

FROM deps AS build
WORKDIR /app
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

FROM deps AS migrations
WORKDIR /app
COPY prisma ./prisma
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache openssl
RUN addgroup -S nodejs && adduser -S khidmatapp -G nodejs

COPY --from=build --chown=khidmatapp:nodejs /app/node_modules ./node_modules
COPY --from=build --chown=khidmatapp:nodejs /app/package*.json ./
COPY --from=build --chown=khidmatapp:nodejs /app/dist ./dist
COPY --from=build --chown=khidmatapp:nodejs /app/prisma ./prisma

USER khidmatapp
EXPOSE 4000
CMD ["node", "dist/server.js"]
