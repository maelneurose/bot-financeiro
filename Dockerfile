# Usa o sistema moderno (Bookworm) para o Chrome funcionar no celular novo
FROM node:20-bookworm-slim

# Instala Git e Chromium
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

# 👇 A SOLUÇÃO DO ERRO 128 👇
# Isso obriga o servidor a usar HTTPS (público) e ignorar SSH (que pede senha)
RUN git config --global url."https://github.com/".insteadOf ssh://git@github.com/
RUN git config --global url."https://".insteadOf git://

# Configuração padrão
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["node", "index.js"]