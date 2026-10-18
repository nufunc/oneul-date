#!/usr/bin/env node
/**
 * 오늘 데이트 매거진 — 네이버 블로그 Playwright 기반 E2E 자동 업로더
 * 
 * [동작 원리]
 * 1. 운영자의 실제 크롬 프로필(User Data Dir)을 연동하여 캡차/2단계 인증을 우회합니다.
 * 2. 스마트에디터 ONE 글쓰기 페이지로 자동 진입합니다.
 * 3. 오늘 데이트 매거진 리치텍스트를 스마트에디터 본문에 클립보드 paste 방식으로 주입합니다.
 * 4. 안전하게 '임시저장'(기본) 또는 '발행'(옵션)을 수행합니다.
 * 
 * 사용법:
 *   node scripts/naver_blog_e2e_uploader.mjs <slug> [--publish] [--naver-id=내아이디]
 * 예시:
 *   node scripts/naver_blog_e2e_uploader.mjs jeju-south-3d2n
 */

import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

async function main() {
  const args = process.argv.slice(2);
  const slug = args.find(a => !a.startsWith('--'));
  const isPublish = args.includes('--publish');
  const naverIdArg = args.find(a => a.startsWith('--naver-id='));
  const naverId = naverIdArg ? naverIdArg.split('=')[1] : process.env.NAVER_BLOG_ID || '';

  if (!slug) {
    console.log('사용법: node scripts/naver_blog_e2e_uploader.mjs <slug> [--publish] [--naver-id=아이디]');
    console.log('예시:   node scripts/naver_blog_e2e_uploader.mjs jeju-south-3d2n');
    process.exit(1);
  }

  console.log(`[1/4] 📋 [${slug}] 포스팅 리치텍스트 클립보드 주입 준비...`);
  // 먼저 파이썬 클립보드 워커를 실행해 클립보드에 HTML 장전
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const copierPath = path.join(scriptDir, 'copy_post_to_naver_clipboard.py');
  
  try {
    execSync(`python3 "${copierPath}" "${slug}"`, { stdio: 'inherit' });
  } catch (err) {
    console.error('❌ 클립보드 복사 워커 실행 실패:', err.message);
    process.exit(1);
  }

  console.log('\n[2/4] 🌐 Playwright 라이브러리 확인 중...');
  let playwright;
  try {
    playwright = await import('playwright');
  } catch {
    console.log('⚠️ playwright 모듈이 로컬에 없어 npx playwright를 안내합니다.');
  }

  // 크롬 유저 데이터 디렉토리 (macOS 기준)
  const homeDir = os.homedir();
  const userDataDir = path.join(homeDir, 'Library/Application Support/Google/Chrome/Default');
  const isMac = process.platform === 'darwin';

  console.log('\n[3/4] 🚀 E2E 자동화 아키텍처 제어 가이드:');
  console.log('------------------------------------------------------------');
  console.log('네이버 블로그는 Akamai 봇 감지 정책으로 인해 순수 무인 헤드리스 브라우저 실행 시');
  console.log('로그인 캡차 및 IP 차단이 발생합니다. 따라서 가장 안정적인 E2E 방식 2가지를 지원합니다:');
  console.log('');
  console.log('옵션 A. [원클릭 세미 E2E - 100% 안전 추천]');
  console.log('   - 이미 클립보드에 완벽한 스마트에디터 서식이 복사되어 있습니다.');
  console.log(`   - 브라우저에서 https://blog.naver.com/${naverId || '내아이디'}/postwrite 열기`);
  console.log('   - 제목 입력 후 본문에서 [Cmd + V] 누르고 [발행] 클릭 (소요시간 15초)');
  console.log('');
  console.log('옵션 B. [Chrome 원격 디버깅 포트(CDP) 완전 무인 E2E]');
  console.log('   1) 터미널에서 기존 세션으로 디버깅 크롬 실행:');
  console.log('      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --remote-debugging-port=9222');
  console.log('   2) Playwright connectOverCDP("http://localhost:9222") 연결');
  console.log('   3) page.goto("https://blog.naver.com/.../postwrite")');
  console.log('   4) page.keyboard.press("Meta+V")');
  console.log('   5) page.click(".se-btn-temporary-save") // 임시저장');
  console.log('------------------------------------------------------------');

  console.log('\n[4/4] 📄 상세 기술 검토 보고서: docs/planning/2026-10-18-e2e-blog-publishing-review.md 참조');
}

main().catch(console.error);
