# 云端浏览器 - 部署镜像
FROM node:22-slim

WORKDIR /app

# 安装运行 Playwright/Chromium 所需系统依赖（TinyFish 模式实际上连远程 CDP，本地模式需要浏览器）
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fonts-liberation libnss3 libatk-bridge2.0-0 libgtk-3-0 \
    libgbm1 libasound2 libxss1 libxtst6 xdg-utils \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY . .
RUN npm run build

ENV NODE_ENV=production \
    PORT=3001 \
    BROWSER_MODE=tinyfish

EXPOSE 3001

CMD ["node", "server/index.js"]
