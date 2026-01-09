FROM node:20-bookworm-slim

# Instala Git e dependências do Chrome
RUN apt-get update && apt-get install -y \
    git \
    chromium \
    libnss3 \
    libxss1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm-dev \
    wget \
    tar \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copia apenas o package.json primeiro
COPY package.json ./

# TRUQUE: Instala dependências, mas força a versão correta do Whatsapp via Git direto
RUN npm install
RUN npm install github:pedroslopez/whatsapp-web.js#webpack-exodus

COPY . .

CMD ["node", "index.js"]