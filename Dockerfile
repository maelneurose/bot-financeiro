FROM node:20-bookworm-slim

# Instala apenas o básico do básico
RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./

# Instala as dependências
RUN npm install

COPY . .

CMD ["node", "index.js"]