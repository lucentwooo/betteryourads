FROM node:20-slim

# Install Chromium and fonts for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Create data directory for job persistence
RUN mkdir -p data/jobs

EXPOSE 3000

CMD ["npm", "start"]
