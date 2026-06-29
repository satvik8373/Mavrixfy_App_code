FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js ./
COPY routes ./routes
COPY services ./services

EXPOSE 8000

CMD ["node", "server.js"]
