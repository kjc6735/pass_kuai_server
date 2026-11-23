# 빌드 단계
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

FROM deps AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

FROM deps AS compile
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

# 실행 단계
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=compile /app/node_modules ./node_modules
COPY --from=compile /app/dist ./dist
COPY package.json ./
EXPOSE 3000
USER node
CMD ["node", "dist/main"]
