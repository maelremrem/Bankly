FROM node:18-alpine
WORKDIR /app

# Install build tools for native modules
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install --production

# Clean up build tools
RUN apk del python3 make g++

COPY . .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/index.js"]
