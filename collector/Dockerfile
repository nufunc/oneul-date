FROM python:3.11-alpine

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    TZ=Asia/Seoul

RUN apk add --no-cache tzdata ca-certificates

COPY . .

CMD ["python", "-u", "main.py"]
