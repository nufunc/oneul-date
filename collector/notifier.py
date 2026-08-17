#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 — 데일리 수집 이력 이메일 리포트 발송 모듈 (Email Notifier)
무료 SMTP (Gmail, Naver 등)를 활용하여 매일 신규 수집 통계, 유튜브 핫클립 TOP 스팟,
카카오맵 평점 현황 및 서비스 바로가기 링크를 담은 프리미엄 HTML 리포트를 발송합니다.
"""

import os
import sys
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime, timezone, timedelta

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

def load_env():
    env = {}
    candidates = [
        os.path.join(os.getcwd(), ".env"),
        os.path.join(os.path.dirname(__file__), ".env"),
        os.path.join(os.path.dirname(__file__), "..", ".env"),
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith("#") and "=" in line:
                            k, v = line.split("=", 1)
                            env[k.strip()] = v.strip().strip('"').strip("'")
                break
            except Exception:
                pass
    return env

def generate_report_html(stats: dict, top_spots: list) -> str:
    """프리미엄 매거진 스타일의 반응형 HTML 이메일 템플릿 생성"""
    kst_now = datetime.now(timezone(timedelta(hours=9))).strftime("%Y년 %m월 %d일 %H:%M")
    
    spots_html = ""
    for idx, s in enumerate(top_spots[:5], 1):
        name = s.get("name", "")
        region = s.get("region", "")
        area = s.get("area", "")
        summary = s.get("summary", "")
        slot = s.get("slot", "day")
        slot_label = "낮(Day)" if slot == "day" else ("저녁(Evening)" if slot == "evening" else "밤(Night)")
        
        # 유튜브 핫클립 정보
        yt_badge = ""
        social_links = s.get("social_links") or {}
        yt_info = social_links.get("youtube") or {}
        if yt_info.get("url"):
            views_txt = f"{yt_info.get('views', 0):,}회" if yt_info.get('views') else "핫클립"
            yt_badge = f'<span style="background: #FFF1F2; color: #E11D48; border: 1px solid #FECDD3; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; margin-left: 6px;">▶ YouTube {views_txt}</span>'
        
        # 카카오맵 평점 정보
        kakao_badge = ""
        kakao_info = social_links.get("kakaomap") or {}
        if kakao_info.get("rating"):
            kakao_badge = f'<span style="background: #FEFCE8; color: #B45309; border: 1px solid #FEF08A; padding: 3px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; margin-left: 6px;">★ {kakao_info.get("rating")}</span>'

        spots_html += f"""
        <div style="background: #ffffff; border: 1px solid #E2E8F0; border-radius: 12px; padding: 14px 18px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
            <div style="font-size: 11px; color: #64748B; font-weight: 600; text-transform: uppercase; margin-bottom: 4px;">#{idx} · [{region} {area}] · {slot_label}</div>
            <div style="font-size: 15px; font-weight: bold; color: #0F172A; margin-bottom: 6px;">
                {name} {yt_badge} {kakao_badge}
            </div>
            <div style="font-size: 13px; color: #475569; line-height: 1.5; font-style: italic;">“{summary}”</div>
        </div>
        """

    if not spots_html:
        spots_html = '<p style="color: #64748B; font-size: 13px; text-align: center;">오늘 추가된 신규 핫플레이스가 없거나 모두 최신 상태입니다.</p>'

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>오늘 데이트 — 데일리 수집 리포트</title>
    </head>
    <body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <div style="max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #E2E8F0; box-shadow: 0 4px 12px rgba(15, 23, 42, 0.05);">
            <!-- 헤더 -->
            <div style="background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%); padding: 28px 24px; text-align: center; color: #ffffff;">
                <div style="font-size: 12px; font-weight: 600; letter-spacing: 1px; color: #94A3B8; text-transform: uppercase; margin-bottom: 8px;">DAILY DATA INGESTION REPORT</div>
                <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">✨ 오늘 데이트 수집 리포트</h1>
                <p style="margin: 8px 0 0; font-size: 13px; color: #CBD5E1;">{kst_now} 기준 자동 수집 이력</p>
            </div>

            <!-- 본문 -->
            <div style="padding: 24px;">
                <!-- 통계 카드 그리드 -->
                <div style="display: table; width: 100%; margin-bottom: 24px;">
                    <div style="display: table-cell; width: 50%; padding-right: 6px;">
                        <div style="background: #F1F5F9; border-radius: 12px; padding: 14px; text-align: center;">
                            <div style="font-size: 11px; color: #64748B; font-weight: 600; margin-bottom: 4px;">신규 발굴 스팟</div>
                            <div style="font-size: 22px; font-weight: 800; color: #0F172A;">+{stats.get('new_spots', 0):,}곳</div>
                        </div>
                    </div>
                    <div style="display: table-cell; width: 50%; padding-left: 6px;">
                        <div style="background: #F1F5F9; border-radius: 12px; padding: 14px; text-align: center;">
                            <div style="font-size: 11px; color: #64748B; font-weight: 600; margin-bottom: 4px;">유튜브 핫클립 연동</div>
                            <div style="font-size: 22px; font-weight: 800; color: #E11D48;">{stats.get('youtube_count', 0):,}곳</div>
                        </div>
                    </div>
                </div>

                <!-- 주요 발굴 핫플레이스 -->
                <h2 style="font-size: 15px; font-weight: 700; color: #0F172A; margin: 0 0 12px; display: flex; align-items: center;">
                    🔥 오늘의 주요 신규 핫플레이스
                </h2>
                {spots_html}

                <!-- 서비스 바로가기 버튼 -->
                <div style="margin-top: 28px; text-align: center;">
                    <a href="https://nufunc.github.io/oneul-date/" target="_blank" style="display: inline-block; background: #0F172A; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 24px; font-size: 13px; font-weight: bold; box-shadow: 0 2px 8px rgba(15, 23, 42, 0.2);">
                        오늘 데이트 서비스 열기 ↗
                    </a>
                </div>
            </div>

            <!-- 푸터 -->
            <div style="background: #F8FAFC; padding: 16px 24px; text-align: center; border-top: 1px solid #E2E8F0; font-size: 11px; color: #94A3B8;">
                본 메일은 오늘 데이트 자율 데이터 엔진에 의해 자동 발송되었습니다.
            </div>
        </div>
    </body>
    </html>
    """
    return html

def send_daily_email_report(stats: dict, top_spots: list = None) -> bool:
    """
    무료 SMTP (Gmail, Naver 등)를 통해 데일리 수집 리포트 이메일 발송
    환경변수:
      - SMTP_SERVER (기본: smtp.gmail.com)
      - SMTP_PORT (기본: 587)
      - SMTP_USER (발신자 이메일 주소)
      - SMTP_PASSWORD (구글 앱 비밀번호 16자리 또는 네이버 비밀번호)
      - RECEIVER_EMAIL (수신자 이메일 주소, 미지정시 SMTP_USER로 발송)
    """
    env = load_env()
    smtp_server = os.getenv("SMTP_SERVER") or env.get("SMTP_SERVER") or "smtp.gmail.com"
    smtp_port = int(os.getenv("SMTP_PORT") or env.get("SMTP_PORT") or 587)
    smtp_user = os.getenv("SMTP_USER") or env.get("SMTP_USER") or ""
    smtp_password = os.getenv("SMTP_PASSWORD") or env.get("SMTP_PASSWORD") or ""
    receiver_email = os.getenv("RECEIVER_EMAIL") or env.get("RECEIVER_EMAIL") or smtp_user

    if not smtp_user or not smtp_password:
        print("ℹ️ [이메일 알림 스킵] SMTP_USER 또는 SMTP_PASSWORD 설정이 없어 이메일 리포트를 전송하지 않습니다.")
        return False

    kst_date = datetime.now(timezone(timedelta(hours=9))).strftime("%m/%d")
    subject = f"💌 [오늘 데이트] {kst_date} 데일리 핫플레이스 수집 리포트 (+{stats.get('new_spots', 0)}곳)"
    html_content = generate_report_html(stats, top_spots or [])

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"오늘 데이트 알리미 <{smtp_user}>"
    msg["To"] = receiver_email
    msg.attach(MIMEText(html_content, "html", "utf-8"))

    try:
        if smtp_port == 465:
            server = smtplib.SMTP_SSL(smtp_server, smtp_port, timeout=10)
        else:
            server = smtplib.SMTP(smtp_server, smtp_port, timeout=10)
            server.starttls()

        server.login(smtp_user, smtp_password)
        server.sendmail(smtp_user, [receiver_email], msg.as_string())
        server.quit()
        print(f"📧 [이메일 리포트 발송 성공] 수신자: {receiver_email}")
        return True
    except Exception as e:
        print(f"❌ [이메일 리포트 발송 실패]: {e}")
        return False

def send_google_chat_report(stats: dict, top_spots: list = None) -> bool:
    """
    Google Chat 수신 웹훅(Incoming Webhook)을 통해 리치 카드 리포트 발송
    환경변수:
      - GOOGLE_CHAT_WEBHOOK_URL
    """
    import urllib.request
    import json

    env = load_env()
    webhook_url = os.getenv("GOOGLE_CHAT_WEBHOOK_URL") or env.get("GOOGLE_CHAT_WEBHOOK_URL") or ""

    if not webhook_url:
        print("ℹ️ [구글챗 알림 스킵] GOOGLE_CHAT_WEBHOOK_URL 설정이 없어 구글챗 메시지를 전송하지 않습니다.")
        return False

    kst_now = datetime.now(timezone(timedelta(hours=9))).strftime("%Y-%m-%d %H:%M")
    
    # 핫플레이스 섹션 위젯 생성
    widgets = [
        {
            "decoratedText": {
                "topLabel": "DAILY SUMMARY",
                "text": f"📊 <b>신규 발굴:</b> +{stats.get('new_spots', 0):,}곳  |  🎬 <b>유튜브 핫클립:</b> {stats.get('youtube_count', 0):,}곳",
                "startIcon": {"knownIcon": "DESCRIPTION"}
            }
        },
        {"divider": {}}
    ]

    for idx, s in enumerate((top_spots or [])[:5], 1):
        name = s.get("name", "")
        region = s.get("region", "")
        area = s.get("area", "")
        summary = s.get("summary", "")
        social = s.get("social_links") or {}
        
        badges = []
        if social.get("youtube", {}).get("views"):
            views = social["youtube"]["views"]
            v_txt = f"{views/10000:.1f}만" if views >= 10000 else f"{views:,}"
            badges.append(f"▶ YT {v_txt}회")
        if social.get("kakaomap", {}).get("rating"):
            badges.append(f"★ {social['kakaomap']['rating']}")
        
        badge_str = f" [{' · '.join(badges)}]" if badges else ""
        
        widgets.append({
            "decoratedText": {
                "topLabel": f"#{idx} [{region} {area}]",
                "text": f"<b>{name}</b>{badge_str}<br><font color=\"#64748B\"><i>“{summary}”</i></font>",
                "wrapText": True
            }
        })

    # 바로가기 버튼 위젯
    widgets.append({
        "buttonList": {
            "buttons": [
                {
                    "text": "오늘 데이트 서비스 열기 ↗",
                    "onClick": {
                        "openLink": {
                            "url": "https://nufunc.github.io/oneul-date/"
                        }
                    }
                }
            ]
        }
    })

    card_payload = {
        "cardsV2": [
            {
                "cardId": "daily_report_card",
                "card": {
                    "header": {
                        "title": "✨ 오늘 데이트 데일리 수집 리포트",
                        "subtitle": f"{kst_now} 기준 자동 수집 현황",
                        "imageUrl": "https://raw.githubusercontent.com/nufunc/oneul-date/main/public/favicon.svg",
                        "imageType": "CIRCLE"
                    },
                    "sections": [
                        {
                            "header": "🔥 오늘의 주요 핫플레이스",
                            "widgets": widgets
                        }
                    ]
                }
            }
        ]
    }

    try:
        req = urllib.request.Request(
            webhook_url,
            data=json.dumps(card_payload).encode('utf-8'),
            headers={"Content-Type": "application/json; charset=UTF-8"},
            method='POST'
        )
        with urllib.request.urlopen(req, timeout=8) as res:
            if res.status in (200, 201):
                print("💬 [Google Chat 리포트 발송 성공]")
                return True
    except Exception as e:
        print(f"❌ [Google Chat 리포트 발송 실패]: {e}")
        return False

def send_daily_digest(stats: dict, top_spots: list = None):
    """설정된 모든 채널(이메일, Google Chat 등)로 데일리 브리핑 발송"""
    send_daily_email_report(stats, top_spots)
    send_google_chat_report(stats, top_spots)

if __name__ == "__main__":
    sample_stats = {
        "new_spots": 15,
        "youtube_count": 13,
        "total_spots": 320
    }
    sample_spots = [
        {
            "name": "프라이데이베이커리",
            "region": "서울",
            "area": "성동구",
            "slot": "day",
            "summary": "성수동 감성 디저트와 빵이 가득한 베이커리 카페",
            "social_links": {"youtube": {"url": "https://youtube.com", "views": 444657}}
        },
        {
            "name": "어반파이어그릴드스테이크",
            "region": "서울",
            "area": "영등포구",
            "slot": "evening",
            "summary": "문래동 창작촌 골목의 분위기 좋은 감성 파스타 다이닝",
            "social_links": {"kakaomap": {"rating": 4.4}}
        }
    ]
    send_daily_digest(sample_stats, sample_spots)
