FROM node:20-bookworm-slim

# Instalação do Chrome e ferramentas básicas
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

# TRUQUE: Instala ignorando erros de dependências opcionais
RUN npm install --no-optional --legacy-peer-deps

COPY . .

CMD ["node", "index.js"]