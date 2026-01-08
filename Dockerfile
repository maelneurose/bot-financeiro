FROM node:18-bullseye-slim

# 1. Instala Git e Chrome (Essencial para não dar erro 128)
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

# 2. Configura a pasta
WORKDIR /app

# 3. Copia e instala
COPY package*.json ./
RUN npm install

# 4. Copia o resto e liga
COPY . .
CMD ["node", "index.js"]