# Usa sistema moderno (Bookworm) para ter Chrome atualizado
FROM node:20-bookworm-slim

# Instala Git (Obrigatório) e Chrome
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

# Configurações padrão
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["node", "index.js"]