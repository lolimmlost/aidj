# frontend/Dockerfile
FROM node:20-alpine AS build
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:stable-alpine
COPY --from=build /usr/src/app/build /usr/share/nginx/html
# optional: custom nginx.conf if you need SPA routing (try default first)
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

