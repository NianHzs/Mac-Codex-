FROM node:22-alpine
WORKDIR /app
COPY package.json server.mjs ./
COPY themes ./themes
EXPOSE 28080
CMD ["node", "server.mjs"]
