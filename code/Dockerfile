FROM node:17.9.1-slim
WORKDIR /app
ENV PROD=true
COPY . /app
RUN mkdir -p /data
CMD node main.js
HEALTHCHECK --interval=30s --retries=3 CMD pgrep node || exit 1
