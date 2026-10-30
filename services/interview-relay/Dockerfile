FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY src ./src
ENV NODE_ENV=production
ARG RELEASE_SHA
ENV RELEASE_SHA=$RELEASE_SHA
USER node
CMD ["node", "--import", "tsx", "src/index.ts"]
