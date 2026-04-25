FROM node:20-alpine

WORKDIR /app

# Build argument for backend URL
ARG EXPO_PUBLIC_BACKEND_URL=https://ahgaffweb-production-c582.up.railway.app
ENV EXPO_PUBLIC_BACKEND_URL=$EXPO_PUBLIC_BACKEND_URL

# Install dependencies
COPY package.json ./
COPY yarn.lock* ./
RUN yarn install --frozen-lockfile 2>/dev/null || yarn install

# Copy source code
COPY . .

# Build the web version
RUN npx expo export --platform web

# Copy PWA files to dist
RUN cp -f web/manifest.json dist/ 2>/dev/null || true && \
    cp -f web/sw.js dist/ 2>/dev/null || true && \
    cp -f web/icon-192.png dist/ 2>/dev/null || true && \
    cp -f web/icon-512.png dist/ 2>/dev/null || true

# Pre-compress for faster serving
RUN find dist -name "*.js" -o -name "*.css" -o -name "*.html" | xargs gzip -k -9 2>/dev/null || true

# Copy serve config
COPY serve.json dist/serve.json

# Install serve
RUN npm install -g serve

# Expose port
EXPOSE 3000

# Serve the static files with config
CMD serve dist -s -l ${PORT:-3000}
