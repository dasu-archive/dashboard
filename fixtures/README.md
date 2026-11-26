# 테스트 데이터 (fixtures)

화면을 시험하는 가짜 데이터예요. 실제 검사 결과가 아니에요.
폴더 구조는 실제 데이터(`projects.json`, `projects/<id>/latest.json`, `history.json`)와 같아요.

| 폴더 | 내용 |
| --- | --- |
| `v1/` | 정상 데이터 2개: `rehab`(게이트 통과, 선택 필드 전부), `demo-failed`(게이트 실패, 리뷰 없음, 선택 필드 없음). 지금은 외부가 계약 v1대로 직접 만든 임시본이고, 내부가 `samples/v1`을 주면 그걸로 바꿔요. |
| `edge/` | 깨지기 쉬운 경우: 값이 전부 없음, 모르는 데이터 버전, 이상한 글자(`<script>` 등), 목록에는 있는데 파일이 없음, 잘못된 id |
| `edge-empty/` | 프로젝트가 하나도 없는 목록 |

## 보는 방법

주소 뒤에 `?fixtures=폴더이름`을 붙여요. `?fixtures=1`은 `v1`과 같아요.

- 목록: `index.html?fixtures=v1`, `?fixtures=edge`, `?fixtures=edge-empty`
- 프로젝트 화면: `project-template.html?fixtures=v1&id=rehab`
- 없는 폴더(예: `?fixtures=nothing`)는 파일이 없을 때(404)를 시험해요.

`projects/` 폴더(내부 Jenkins 소유)에는 테스트 데이터를 넣지 않아요.
