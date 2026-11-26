# 테스트 데이터 (fixtures)

화면을 시험하는 가짜 데이터예요. 실제 검사 결과가 아니에요.
폴더 구조는 실제 데이터(`projects.json`, `projects/<id>/latest.json`, `history.json`)와 같아요.

| 폴더 | 내용 |
| --- | --- |
| `v1/` | 내부(code-nyang-e)의 공식 샘플 `samples/v1`을 그대로 복사한 것: `rehab`(게이트 통과, 선택 필드 전부, 회차 6개), `demo-failed`(게이트 실패, 테스트 1개 실패, 지적 0개, 선택 필드 없음, 회차 기록 없음). 내부 샘플이 바뀌면 다시 복사해요. 직접 고치지 않아요. |
| `edge/` | 깨지기 쉬운 경우: 값이 전부 없음, 모르는 데이터 버전, 이상한 글자(`<script>` 등), 목록에는 있는데 파일이 없음, 잘못된 id |
| `edge-empty/` | 프로젝트가 하나도 없는 목록 |
| `many/` | 메인 대시보드 시험용 프로젝트 6개 (회차 3–4개씩, 리뷰 없는 프로젝트 1개, 아직 검사 전인 프로젝트 1개, 테스트가 실패한 프로젝트 2개: 게이트 통과 `shop-api`, 게이트 실패 `batch-worker`) |

## 보는 방법

주소 뒤에 `?fixtures=폴더이름`을 붙여요. `?fixtures=1`은 `v1`과 같아요.

- 메인 대시보드: `index.html?fixtures=v1`, `?fixtures=many`, `?fixtures=edge`, `?fixtures=edge-empty`
- 프로젝트 화면: `project-template.html?fixtures=v1&id=rehab`
- 없는 폴더(예: `?fixtures=nothing`)는 파일이 없을 때(404)를 시험해요.

`projects/` 폴더(내부 Jenkins 소유)에는 테스트 데이터를 넣지 않아요.
