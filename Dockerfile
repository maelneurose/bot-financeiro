FROM node:18-bullseye-slim

# Instala dependências do Chrome e ferramentas de sistema
RUN apt-get update && apt-get install -y \
    wget \
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