# Mudei para 'bookworm' (versão mais nova do Linux) para ter o Chrome Atualizado
FROM node:20-bookworm-slim

# Instala o Chromium Moderno e dependências
RUN apt-get update && apt-get install -y \
    chromium \
    libnss3 \
    libxss1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm-dev \
    && rm -rf /var/lib/apt/lists/*

# Configura a pasta
WORKDIR /app

# Copia e instala
COPY package*.json ./
RUN npm install

# Copia o resto e liga
COPY . .
CMD ["node", "index.js"]