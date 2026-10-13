# Корневой Dockerfile для Amvera / любого Docker-хостинга: собирает tradebot/ из этого репозитория.
FROM python:3.11-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 TB_DATA_DIR=/data TB_WEB_HOST=0.0.0.0 TB_WEB_PORT=8080
COPY tradebot/requirements.txt .
RUN pip install -r requirements.txt
COPY tradebot/tradebot ./tradebot
COPY tradebot/config.example.yaml ./config.example.yaml
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 8080
CMD ["python", "-m", "tradebot", "run"]
