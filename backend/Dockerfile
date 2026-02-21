# ---------- Builder ----------
FROM node:20-alpine AS builder
WORKDIR /app

# Install deps
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build (NestJS)
RUN npm run build

# If Prisma exists, generate client at build-time
# (If you don't use Prisma, you can remove these two lines.)
RUN npx prisma generate || true

# ---------- Runner ----------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Copy only necessary files
COPY --from=builder /app/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# If Prisma exists and runtime needs it:
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Default port (Traefik will route to this)
ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/main.js"]