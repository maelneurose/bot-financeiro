FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y \
    chromium \
    libnss3 \
    libxss1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
# Instalação limpa e rápida
RUN npm install
COPY . .
CMD ["node", "index.js"]