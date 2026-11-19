FROM python:3.11-alpine

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    TZ=Asia/Seoul

RUN apk add --no-cache tzdata ca-certificates

# 언급 근거 장소 추출의 Claude 경로(P-533). 2.10.0은 2026-11-17 PyPI 최신 안정판이고 musllinux 휠이 있다
RUN pip install --no-cache-dir anthropic==2.10.0

COPY . .

CMD ["python", "-u", "main.py"]
