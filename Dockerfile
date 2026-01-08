FROM node:18-bullseye-slim

# Instala dependências do Chrome E O GIT (Essencial para baixar do GitHub)
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

# Configurações do Node
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Comando para iniciar
CMD node index.js