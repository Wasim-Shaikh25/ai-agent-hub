FROM node:20-slim

WORKDIR /app

# Install dependencies first (better layer caching).
COPY package.json ./
RUN npm install

# Copy source and build.
COPY . .
RUN npm run build

EXPOSE 8080

# Migrations + dev seed run on boot inside main().
CMD ["node", "dist/index.js"]
