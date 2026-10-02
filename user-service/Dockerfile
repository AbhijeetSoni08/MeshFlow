# Stage 1: Dependencies Cache
FROM node:18-alpine AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

# Stage 2: Production Runtime
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

# Set permissions for unprivileged node user
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node . .

EXPOSE 3001
USER node
CMD ["node", "src/index.js"]
