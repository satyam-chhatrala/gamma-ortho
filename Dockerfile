# dockerfile
# Use an official Node.js runtime as a parent image
FROM node:18-slim

  WORKDIR /usr/src/app

  COPY package*.json ./
  RUN npm install --omit=dev

  COPY . .

  EXPOSE 8080 
  CMD [ "npm", "start" ]
  
