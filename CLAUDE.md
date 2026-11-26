# dashboard

code-nyang-e(미니 PC 검사기)가 검사한 프로젝트 결과를 보여주는 공개 대시보드.
GitHub Pages 정적 사이트: https://dasu-archive.github.io/dashboard/

## 정본과 소통 (Notion MCP)
- 정본이자 소통 창구는 Notion이다. 주소는 이 레포에 두지 않는다.
- 주소는 CLAUDE.local.md(커밋 안 함)에 있다. 그 파일이 없으면 Notion MCP로 "Code NyangE" 페이지를 검색해서 찾는다.
- 내 상세 페이지는 공통 페이지 안의 "외부" 페이지, 이슈 DB와 요구사항 DB도 공통 페이지 안에 있다.
- 데이터 계약 정본: https://github.com/dasu-archive/code-nyang-e/tree/main/schema/v1
- 나는 "외부"다. 내부(code-nyang-e)를 만드는 Claude Code와는 직접 연결되어 있지 않다.

## 세션 루틴
1. 공통 페이지와 내 상세 페이지를 읽는다.
2. 요구사항 DB에서 받는 쪽 = 외부, 상태 = 요청/수락/진행 중인 것을 확인하고 처리한다.
3. 작업한다.
4. 내 문제·할 일은 이슈 DB(영역 = 외부, 버전 = 지금 작업 중인 외부 버전. 현재 1.0.0). 내부에 부탁할 것은 요구사항 DB(보낸 쪽 = 외부, 받는 쪽 = 내부).
   도건이 정할 것은 담당 또는 받는 쪽 = 도건.
5. 끝나면 내 상세 페이지의 "현재 상태"와 작업 목록 체크를 갱신한다.

## 규칙
- Notion 주소·ID는 레포 파일, 커밋 메시지, PR, 코드 주석에 쓰지 않는다.
- CLAUDE.local.md는 올리지 않는다 (Notion 주소가 들어 있음). CLAUDE.md는 주소 없이 커밋한다.
- projects.json과 projects/ 아래 파일은 Jenkins(내부) 소유다. 절대 수정·커밋하지 않는다.
- 데이터 형식이 부족하면 직접 바꾸지 말고 요구사항 DB에 종류 = 데이터 계약으로 요청한다.
- fetch는 상대 경로, cache: 'no-store'.
- 데이터 글자는 textContent로 넣는다. innerHTML 금지.
- null은 "—"로 표시하고 0과 구분한다.
- 빌드 단계 없음. .nojekyll 유지.
- 푸시 전에 git pull --rebase (Jenkins도 같은 main에 push한다).