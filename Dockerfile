FROM node:24-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package.json ./
COPY server.js ./
COPY schema.sql ./
COPY public ./public
COPY src ./src

RUN mkdir -p data

EXPOSE 3000

CMD ["node", "server.js"]
