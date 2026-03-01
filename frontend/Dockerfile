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

# Install serve
RUN npm install -g serve

# Expose port
EXPOSE 3000

# Serve the static files - use $PORT from Railway
CMD serve dist -s -l ${PORT:-3000}
