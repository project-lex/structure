FROM node:20-alpine
# Werkzeuge, die die Make-Targets und Compose-Aufrufe brauchen (Docker-Socket wird vom Host gemountet).
RUN apk add --no-cache docker-cli docker-cli-compose make bash git curl openssh-client
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV UI_HOST=0.0.0.0 UI_PORT=81
EXPOSE 81
CMD ["npm", "start", "--silent"]
