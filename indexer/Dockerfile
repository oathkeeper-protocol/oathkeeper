FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 42069
CMD ["npx", "ponder", "start", "--schema", "public"]
