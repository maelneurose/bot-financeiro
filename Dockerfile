# Usa sistema moderno (Bookworm) para ter o Chrome compatível com 2026
FROM node:20-bookworm-slim

# Instala apenas o Chromium e dependências (Sem Git, pois não precisa mais)
RUN apt-get update && apt-get install -y \
    chromium \
    libnss3 \
    libxss1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm-dev \
    && rm -rf /var/lib/apt/lists/*

# Configuração padrão
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["node", "index.js"]