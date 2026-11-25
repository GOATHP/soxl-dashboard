# SOXL 포지션

SOXL 보유자끼리 평단과 손익을 비교하는 정적 페이지입니다. 각자 이름, 주식수, 평단을 넣고 "비교 링크 복사"로 목록을 공유할 수 있습니다. GitHub Pages로 배포됩니다.

- `index.html`: 페이지
- `data/soxl.json`: 시세 데이터
- `scripts/update_quote.py` + `.github/workflows/update-quote.yml`: 평일 미국 장 마감 후(한국시간 06:30) Yahoo Finance에서 시세를 받아 `data/soxl.json`을 갱신합니다. Actions 탭에서 수동 실행도 됩니다.

투자 조언이 아닙니다.
