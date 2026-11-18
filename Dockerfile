FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY public ./public
ENV NODE_ENV=production
EXPOSE 8080
# Run as the unprivileged "node" user that ships with the image
USER node
CMD ["node", "server/index.js"]
