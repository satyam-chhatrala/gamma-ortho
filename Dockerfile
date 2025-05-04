# Use an official Node.js runtime as a parent image.
# Version 18-slim is a good balance of features and size.
# You can change '18-slim' to another version like '20-slim' if your app requires it.
FROM node:18-slim

# Set the working directory inside the container.
# All subsequent commands (COPY, RUN, CMD) will be executed from this directory.
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (if you use npm) or yarn.lock (if you use yarn)
# This step is done separately to leverage Docker's layer caching.
# If these files haven't changed, Docker can reuse the cached layer from a previous build,
# speeding up the 'npm install' step.
COPY package*.json ./
# If using yarn, you would uncomment the next line and comment out the package*.json line:
# COPY package.json yarn.lock ./

# Install application dependencies.
# --omit=dev (for npm) or --production (for yarn) ensures only production dependencies are installed,
# making the final image smaller and more secure.
# If using npm:
RUN npm install --omit=dev
# If using yarn, comment out the npm line and uncomment the yarn line:
# RUN yarn install --production --frozen-lockfile

# Copy the rest of your application's source code into the working directory in the container.
# The '.' means copy everything from the current directory (where the Dockerfile is)
# to the WORKDIR (/usr/src/app) in the container.
# Files listed in .dockerignore will be excluded.
COPY . .

# Inform Docker that the container listens on port 8080 at runtime.
# Note: Cloud Run will actually use the PORT environment variable it injects.
# This EXPOSE instruction is more for documentation and for inter-container communication if needed.
EXPOSE 8080 

# Define the command that will be executed when the container starts.
# This should be the command to start your Node.js server.
# It uses the "start" script defined in your package.json.
CMD [ "npm", "start" ]
# Alternatively, if you don't want to rely on the npm script:
# CMD [ "node", "server.js" ]
