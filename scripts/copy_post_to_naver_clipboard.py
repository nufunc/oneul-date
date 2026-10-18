#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
오늘 데이트 매거진 — 네이버 블로그 스마트에디터 ONE 호환 클립보드 주입 워커
사용법: python3 scripts/copy_post_to_naver_clipboard.py <slug>
예시:   python3 scripts/copy_post_to_naver_clipboard.py jeju-south-3d2n
"""

import sys
import os
import re
import subprocess

def clean_html_for_smarteditor(html_content):
    """
    오늘 데이트 매거진 HTML을 네이버 블로그 스마트에디터 ONE이 가장 깔끔하게
    인식할 수 있는 인라인 스타일 리치 HTML로 변환합니다.
    """
    # 1. <article> 본문 추출
    article_match = re.search(r'<article>(.*?)</article>', html_content, re.DOTALL)
    if not article_match:
        return html_content
    body = article_match.group(1)

    # 2. 제목 추출
    title_match = re.search(r'<h1 class="post-title">([^<]+)</h1>', body)
    title = title_match.group(1).strip() if title_match else ""

    # 3. 인트로 추출
    intro_match = re.search(r'<div class="intro-box">(.*?)</div>', body, re.DOTALL)
    intro_text = ""
    if intro_match:
        # p 태그들 추출
        p_tags = re.findall(r'<p>(.*?)</p>', intro_match.group(1), re.DOTALL)
        intro_text = "".join([f'<p style="font-size: 16px; line-height: 1.85; color: #4b5563; margin-bottom: 14px;">{p.strip()}</p>' for p in p_tags])

    # 4. 섹션별 변환 (h2, p, 사진, 팁박스, 지도버튼)
    # 사진 카드 변환
    def replace_photo_card(match):
        img_src = match.group(1)
        img_alt = match.group(2)
        caption = match.group(3)
        source = match.group(4)
        return f'''
        <div style="text-align: center; margin: 24px 0 16px 0;">
            <img src="{img_src}" alt="{img_alt}" style="max-width: 100%; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.08);" />
            <p style="font-size: 13px; color: #888888; margin-top: 8px; line-height: 1.5;">{caption} ({source})</p>
        </div>
        '''

    body = re.sub(
        r'<div class="photo-card">\s*<img src="([^"]+)" alt="([^"]+)"[^>]*>\s*<div class="photo-caption">\s*<span>([^<]+)</span>\s*<span>([^<]+)</span>\s*</div>\s*</div>',
        replace_photo_card,
        body
    )

    # h2 스팟 헤딩 변환
    def replace_h2(match):
        text = match.group(1)
        # 태그 제거
        clean_text = re.sub(r'<[^>]+>', '', text).strip()
        return f'<h3 style="font-size: 20px; font-weight: 800; color: #1e293b; margin: 36px 0 14px 0; padding-bottom: 8px; border-bottom: 2px solid #0284c7;">{clean_text}</h3>'

    body = re.sub(r'<h2 class="spot-heading">(.*?)</h2>', replace_h2, body)

    # 팁 박스 변환
    def replace_tip(match):
        tip_text = match.group(1).strip()
        # tip-title 제거
        tip_text = re.sub(r'<div class="tip-title">.*?</div>', '', tip_text, flags=re.DOTALL).strip()
        return f'''
        <blockquote style="background: #f0f9ff; border-left: 4px solid #0284c7; padding: 14px 18px; margin: 20px 0; border-radius: 4px; font-size: 15px; color: #0369a1; line-height: 1.75;">
            <strong>💡 에디터 추천 꿀팁</strong><br/>
            {tip_text}
        </blockquote>
        '''

    body = re.sub(r'<div class="tip-box">(.*?)</div>', replace_tip, body, flags=re.DOTALL)

    # 안내 그리드 (info-grid) 변환
    def replace_info_grid(match):
        items = re.findall(r'<div class="info-item"><span class="info-label">([^<]+)</span><span class="info-val">([^<]+)</span></div>', match.group(1))
        rows = "".join([f'<tr><td style="padding: 6px 12px; font-weight: bold; color: #475569; width: 90px; border-bottom: 1px solid #f1f5f9;">{k}</td><td style="padding: 6px 12px; color: #1e293b; border-bottom: 1px solid #f1f5f9;">{v}</td></tr>' for k, v in items])
        return f'<table style="width: 100%; border-collapse: collapse; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; margin: 18px 0; font-size: 14px;">{rows}</table>'

    body = re.sub(r'<div class="info-grid">(.*?)</div>', replace_info_grid, body, flags=re.DOTALL)

    # 지도 버튼 변환
    def replace_map_btn(match):
        url = match.group(1)
        name = match.group(2)
        return f'''
        <div style="margin: 14px 0 28px 0; text-align: left;">
            <a href="{url}" target="_blank" style="display: inline-block; background: #03c75a; color: #ffffff; padding: 9px 16px; border-radius: 6px; font-weight: bold; font-size: 14px; text-decoration: none;">
                🧭 네이버 지도에서 바로보기 ↗
            </a>
        </div>
        '''

    body = re.sub(r'<div class="map-btn-wrap">\s*<a href="([^"]+)"[^>]*>\s*<span>([^<]+)</span>\s*</a>\s*</div>', replace_map_btn, body)

    # 최종 네이버 블로그 친화적 풀 템플릿
    full_html = f'''
    <div style="max-width: 720px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; line-height: 1.8; color: #333333;">
        <h1 style="font-size: 26px; font-weight: 800; color: #111827; margin-bottom: 18px; line-height: 1.35;">{title}</h1>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 18px 0 24px 0;" />
        {intro_text}
        {body}
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 36px 0 24px 0;" />
        <p style="font-size: 13px; color: #9ca3af; text-align: center;">
            본 콘텐츠는 오늘 데이트 에디토리얼 팀에서 공개 데이터를 기반으로 정성껏 기획·작성하였습니다.
        </p>
    </div>
    '''
    return full_html

def copy_to_clipboard(html_snippet):
    temp_file = '/tmp/naver_smarteditor_clipboard.html'
    with open(temp_file, 'w', encoding='utf-8') as f:
        f.write(html_snippet)

    # macOS AppleScript를 통해 HTML 클립보드로 복사
    cmd = f"osascript -e 'set the clipboard to (read (POSIX file \"{temp_file}\") as «class HTML»)'"
    res = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if res.returncode == 0:
        return True
    else:
        print("AppleScript Error:", res.stderr)
        return False

def main():
    if len(sys.argv) < 2:
        print("사용법: python3 scripts/copy_post_to_naver_clipboard.py <slug>")
        print("예시:   python3 scripts/copy_post_to_naver_clipboard.py jeju-south-3d2n")
        sys.exit(1)

    slug = sys.argv[1].strip()
    post_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'public', 'blog', slug, 'index.html')
    if not os.path.exists(post_path):
        # agy 디렉토리 fallback
        post_path = f"/Users/woongpark/git/oneul-date-agy/public/blog/{slug}/index.html"

    if not os.path.exists(post_path):
        print(f"오류: '{post_path}' 파일을 찾을 수 없습니다.")
        sys.exit(1)

    with open(post_path, 'r', encoding='utf-8') as f:
        raw_html = f.read()

    cleaned = clean_html_for_smarteditor(raw_html)
    success = copy_to_clipboard(cleaned)

    if success:
        print(f"✅ [{slug}] 포스팅이 네이버 블로그 스마트에디터 ONE 전용 리치텍스트로 클립보드에 복사되었습니다!")
        print("📋 사용 방법:")
        print("   1. 네이버 블로그 글쓰기(스마트에디터 ONE) 열기")
        print("   2. 본문 영역을 클릭하고 Cmd + V (붙여넣기)")
        print("   3. 서식, 굵은 글씨, 팁 박스, 인용구, 이미지가 네이버 블로그 컴포넌트로 완벽 변환됩니다.")
    else:
        print("❌ 클립보드 복사 실패")

if __name__ == '__main__':
    main()
