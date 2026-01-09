FROM node:20-bookworm-slim

# Instala Git, Chrome e ferramentas de segurança
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

# Configura o Git para usar HTTPS (resolve o erro 128 da Railway)
RUN git config --global url."https://github.com/".insteadOf ssh://git@github.com/
RUN git config --global url."https://".insteadOf git://

WORKDIR /app

COPY package*.json ./

# 1. Instala as dependências normais (Supabase, etc)
RUN npm install

# 2. INSTALAÇÃO FORÇADA DA VERSÃO 2026 DO WHATSAPP
# Isso baixa o código direto do criador, pulando a versão velha do NPM
RUN npm install github:pedroslopez/whatsapp-web.js#main --no-save

COPY . .

CMD ["node", "index.js"]