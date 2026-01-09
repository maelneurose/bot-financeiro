FROM node:20-bookworm-slim

# Instala Chrome e dependências
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

# Instalação padrão (vai pegar o link do package.json acima)
RUN npm install

COPY . .

CMD ["node", "index.js"]