FROM node:18-bullseye-slim

# 1. Instala o Git (Obrigatório para baixar o WhatsApp novo) e o Chrome
RUN apt-get update && apt-get install -y \
    git \
    chromium \
    libnss3 \
    libxss1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm-dev \
    && rm -rf /var/lib/apt/lists/*

# 2. Configura a pasta do bot
WORKDIR /app

# 3. Copia os arquivos de configuração
COPY package*.json ./

# 4. Instala os pacotes (Agora vai funcionar porque o Git está instalado!)
RUN npm install

# 5. Copia o resto do código
COPY . .

# 6. Liga o bot
CMD ["node", "index.js"]