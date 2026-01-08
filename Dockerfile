FROM node:18-bullseye-slim

# 1. Instala Git e Chrome
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

# 2. 🚨 CORREÇÃO DO ERRO 128 (Força HTTPS ao invés de SSH)
RUN git config --global url."https://github.com/".insteadOf ssh://git@github.com/
RUN git config --global url."https://".insteadOf git://

# 3. Configura a pasta
WORKDIR /app

# 4. Copia e instala
COPY package*.json ./
RUN npm install

# 5. Copia o resto e liga
COPY . .
CMD ["node", "index.js"]