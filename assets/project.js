// 프로젝트 화면 (project-template.html → projects/<id>/index.html).
// 같은 폴더의 latest.json을 읽어 머리말, 개요, Claude 리뷰, Sonar 이슈, 종합 의견을 그린다.
// 미리보기: 루트의 project-template.html?fixtures=v1&id=rehab → fixtures/v1/projects/rehab/latest.json
import {
  h, arr, str, isObj, isNum, isName, val, DASH, fmtInt, fmtPercent, fmtTime, fmtDate, shortSha,
  repoUrl, commitUrl, fileUrl, pathText, linkOrText, gateStatus, gateText, fixtureSet,
  loadJson, loadErrorText, stateBox, fixturesBanner, versionBanner,
} from './common.js';

const params = new URLSearchParams(location.search);
const preview = /\/project-template\.html$/.test(location.pathname);
const set = preview ? fixtureSet(params) : undefined;

const app = document.getElementById('app');
const notices = document.getElementById('notices');

const listHref = preview ? (set ? `./?fixtures=${set}` : './') : '../../';
for (const a of document.querySelectorAll('[data-link="list"]')) a.href = listHref;

// ---------- 화면 이름 ----------

const QUALITY = { reliability: '신뢰성', security: '보안', maintainability: '유지보수성' };
const CATEGORY = { transaction: '트랜잭션', concurrency: '동시성', scale: '대용량', failure: '장애 대응', other: '기타' };
const CLAUDE_SEV = { high: '높음', medium: '보통', low: '낮음' };
const SONAR_SEV = { blocker: '차단', high: '높음', medium: '보통', low: '낮음', info: '정보' };
const SEV_RANK = { blocker: 5, high: 4, medium: 3, low: 2, info: 1 };

// 게이트 조건 지표. 계약 보완 요청의 이름과 Sonar 원래 이름을 둘 다 안다.
const METRICS = {
  newIssues: ['새 이슈', 'count'],
  new_violations: ['새 이슈', 'count'],
  newHotspotsReviewed: ['새 핫스팟 검토율', 'percent'],
  new_security_hotspots_reviewed: ['새 핫스팟 검토율', 'percent'],
  newCoverage: ['새 코드 커버리지', 'percent'],
  new_coverage: ['새 코드 커버리지', 'percent'],
  newDuplication: ['새 코드 중복', 'percent'],
  new_duplicated_lines_density: ['새 코드 중복', 'percent'],
  newReliabilityRating: ['새 코드 신뢰성 등급', 'rating'],
  new_reliability_rating: ['새 코드 신뢰성 등급', 'rating'],
  newSecurityRating: ['새 코드 보안 등급', 'rating'],
  new_security_rating: ['새 코드 보안 등급', 'rating'],
  newMaintainabilityRating: ['새 코드 유지보수성 등급', 'rating'],
  new_maintainability_rating: ['새 코드 유지보수성 등급', 'rating'],
  coverage: ['커버리지', 'percent'],
  duplication: ['중복', 'percent'],
  duplicated_lines_density: ['중복', 'percent'],
  issues: ['이슈', 'count'],
  violations: ['이슈', 'count'],
  reliabilityRating: ['신뢰성 등급', 'rating'],
  reliability_rating: ['신뢰성 등급', 'rating'],
  securityRating: ['보안 등급', 'rating'],
  security_rating: ['보안 등급', 'rating'],
  maintainabilityRating: ['유지보수성 등급', 'rating'],
  sqale_rating: ['유지보수성 등급', 'rating'],
};

/** 데이터 값으로 위 표를 찾을 때. 표에 직접 적은 키만 찾는다 (constructor 같은 값 막기) */
const pick = (map, key) => (typeof key === 'string' && Object.hasOwn(map, key) ? map[key] : undefined);
const rank = (sev) => pick(SEV_RANK, sev) ?? 0;

// ---------- 작은 부품 ----------

function section(title, ...kids) {
  return h('section', { class: 'section' },
    h('div', { class: 'section__head' }, h('h2', null, title)),
    ...kids);
}

function stat(label, value, sub) {
  return h('div', { class: 'stat' },
    h('span', { class: 'stat__label' }, label),
    h('span', { class: 'stat__value' }, value),
    sub ? h('span', { class: 'stat__sub' }, sub) : null);
}

function ratingBadge(v) {
  return typeof v === 'string' && /^[A-E]$/.test(v)
    ? h('span', { class: 'rating', data: { rating: v }, title: `등급 ${v}` }, v)
    : null;
}

function sevBadge(sev, labels) {
  const key = str(sev);
  return h('span', { class: 'sev', data: { sev: key ?? 'unknown' } }, pick(labels, key) ?? key ?? DASH);
}

function codeLocation(item, ctx) {
  const file = str(item.file);
  if (!file) return val(null);
  const line = Number.isInteger(item.line) && item.line > 0 ? item.line : null;
  const text = line ? `${file}:${line}` : file;
  return linkOrText(pathText(text), fileUrl(ctx.repo, ctx.commit, file, line), 'mono');
}

function byLocation(a, b) {
  const fa = str(a.file) ?? '￿';
  const fb = str(b.file) ?? '￿';
  if (fa !== fb) return fa < fb ? -1 : 1;
  return (Number.isInteger(a.line) ? a.line : 0) - (Number.isInteger(b.line) ? b.line : 0);
}

// 있을 때만 보여주는 선택 필드: 없거나 null이면 칸을 숨긴다.
const has = (v) => v !== undefined && v !== null;

/** 필터가 붙은 표. filters의 match는 (행, 고른 값) → 보여줄지 */
function filterTable({ caption, filters, columns, rows }) {
  const count = h('span', { class: 'filters__count' });
  const selects = filters.map((f) => h('select', null,
    h('option', { value: '' }, '전체'),
    f.options.map(([value, label]) => h('option', { value }, label))));
  const bar = h('div', { class: 'filters' },
    filters.map((f, i) => h('label', null, f.label, selects[i])),
    count);
  const tbody = h('tbody');
  const wrap = h('div', { class: 'table-wrap' },
    h('table', { class: 'table' },
      h('caption', { class: 'visually-hidden' }, caption),
      h('thead', null, h('tr', null, columns.map((c) => h('th', { scope: 'col', class: c.cls }, c.label)))),
      tbody));
  const none = stateBox('empty', '조건에 맞는 항목이 없어요');

  function update() {
    const shown = rows.filter((r) => filters.every((f, i) => !selects[i].value || f.match(r, selects[i].value)));
    tbody.replaceChildren(...shown.map((r) => h('tr', null, columns.map((c) => h('td', { class: c.cls }, c.render(r))))));
    count.textContent = `${rows.length}개 중 ${shown.length}개`;
    wrap.hidden = shown.length === 0;
    none.hidden = shown.length !== 0;
  }
  for (const s of selects) s.addEventListener('change', update);
  update();
  return h('div', null, bar, wrap, none);
}

// ---------- 게이트 조건 글자 ----------

function toNum(v) {
  if (isNum(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return null;
}

function metricInfo(metric, sample) {
  const known = pick(METRICS, metric);
  if (known) return { label: known[0], kind: known[1] };
  const kind = typeof sample === 'string' && /^[A-E]$/.test(sample) ? 'rating' : 'number';
  return { label: str(metric) ?? '이름 없는 지표', kind };
}

function fmtMetric(v, kind) {
  if (v === undefined || v === null || v === '') return null;
  if (kind === 'rating') {
    if (typeof v === 'string' && /^[A-E]$/.test(v)) return v;
    const n = toNum(v);
    return Number.isInteger(n) && n >= 1 && n <= 5 ? 'ABCDE'[n - 1] : String(v);
  }
  const n = toNum(v);
  if (n === null) return String(v);
  if (kind === 'percent') return `${n.toFixed(1)}%`;
  if (kind === 'count') return `${Math.round(n).toLocaleString('ko-KR')}개`;
  return n.toLocaleString('ko-KR');
}

/** Sonar 조건은 "이러면 실패"(gt: 기준보다 크면 실패). 화면에는 "이래야 통과"로 쓴다 */
function requirement(comparator, threshold, kind) {
  const t = fmtMetric(threshold, kind);
  if (t === null) return null;
  const c = typeof comparator === 'string' ? comparator.toLowerCase() : '';
  if (kind === 'rating') return c === 'gt' ? `${t} 또는 더 좋음` : t;
  if (c === 'gt') return `${t} 이하`;
  if (c === 'lt') return `${t} 이상`;
  return t;
}

function newCodeText(def) {
  if (!isObj(def)) return '';
  const v = def.value === undefined || def.value === null ? null : String(def.value);
  let text;
  switch (def.type) {
    case 'previous_version': text = v ? `이전 버전(${v}) 이후` : '이전 버전 이후'; break;
    case 'days': text = v ? `최근 ${v}일` : '최근 며칠'; break;
    case 'reference_branch': text = v ? `${v} 브랜치와 비교` : '기준 브랜치와 비교'; break;
    case 'specific_analysis': text = v ? `${v} 분석 이후` : '지정한 분석 이후'; break;
    default: text = str(def.type);
  }
  return text ? `새 코드 기준: ${text}` : '';
}

// ---------- 머리말 ----------

function renderHeader(d) {
  const p = isObj(d.project) ? d.project : {};
  const r = isObj(d.run) ? d.run : {};
  const name = str(p.name) ?? str(p.id) ?? '이름 없음';
  document.title = `${name} · Code NyangE 검사 결과`;
  const repo = str(p.repo);
  const sha = str(r.commit);
  const item = (label, value) => h('li', { class: 'meta__item' }, h('span', { class: 'meta__label' }, label), value);

  return h('div', { class: 'page-header' },
    h('h1', null, name),
    h('ul', { class: 'meta' },
      item('레포', repo ? linkOrText(repo, repoUrl(repo)) : val(null)),
      item('검사', val(fmtTime(r.at))),
      item('커밋', sha ? linkOrText(shortSha(sha), commitUrl(repo, sha), 'mono') : val(null)),
      item('브랜치', str(r.branch) ? h('span', { class: 'mono' }, r.branch) : val(null)),
      item('빌드', Number.isInteger(r.build) ? `#${r.build}` : val(null))));
}

// ---------- 개요 ----------

function renderGate(qg) {
  const g = isObj(qg) ? qg : {};
  const status = gateStatus(g.status);
  const conditions = arr(g.conditions).filter(isObj);
  const failed = conditions.filter((c) => c.status === 'failed');

  let sub = '품질 게이트 결과를 받지 못했어요';
  if (status === 'failed') sub = failed.length ? `품질 게이트 · 조건 ${failed.length}개 실패` : '품질 게이트';
  if (status === 'passed') sub = conditions.length ? `품질 게이트 · 조건 ${conditions.length}개 모두 통과` : '품질 게이트';

  return h('div', null,
    h('div', { class: 'gate-hero', data: { status } },
      h('span', { class: 'gate-hero__label' }, gateText(status)),
      h('span', { class: 'gate-hero__sub' }, sub)),
    failed.length
      ? h('ul', { class: 'conditions', 'aria-label': '실패한 조건' }, failed.map((c) => {
        const info = metricInfo(c.metric, c.threshold);
        return h('li', null,
          h('span', { class: 'conditions__metric' }, info.label),
          h('span', { class: 'conditions__detail' },
            '기준 ', val(requirement(c.comparator, c.threshold, info.kind)),
            ' · 실제 ', val(fmtMetric(c.actual, info.kind))));
      }))
      : null);
}

function renderStats(s, scope) {
  const issues = isObj(s.issues) ? s.issues : {};
  const ratings = isObj(s.ratings) ? s.ratings : {};
  const cells = Object.entries(QUALITY).map(([q, label]) =>
    stat(`${label} 이슈`, [val(fmtInt(issues[q])), ratingBadge(ratings[q])]));

  if (has(s.acceptedIssues)) cells.push(stat('수락된 이슈', val(fmtInt(s.acceptedIssues))));
  if (isObj(s.hotspots)) {
    const reviewed = fmtPercent(s.hotspots.reviewedPercent);
    cells.push(stat('보안 핫스팟', val(fmtInt(s.hotspots.total)), reviewed ? `검토 ${reviewed}` : null));
  }

  const coverSub = [
    has(s.linesToCover) ? `커버할 줄 ${fmtInt(s.linesToCover) ?? DASH}` : null,
    has(s.uncoveredLines) ? `미커버 ${fmtInt(s.uncoveredLines) ?? DASH}` : null,
  ].filter(Boolean).join(' · ');
  cells.push(stat('커버리지', val(fmtPercent(s.coverage)), coverSub || null));
  cells.push(stat('중복', val(fmtPercent(s.duplication))));
  if (scope === 'overall') cells.push(stat('코드 줄 수', val(fmtInt(s.lines))));
  else if (has(s.lines)) cells.push(stat('새 줄 수', val(fmtInt(s.lines))));

  return h('div', { class: 'stats' }, cells);
}

function renderTests(t) {
  const tests = isObj(t) ? t : {};
  return h('div', { class: 'subsection' },
    h('h3', null, '테스트'),
    h('div', { class: 'stats' },
      stat('전체', val(fmtInt(tests.total))),
      stat('실패', val(fmtInt(tests.failed))),
      stat('건너뜀', val(fmtInt(tests.skipped)))));
}

function renderOverview(d) {
  const sec = section('개요', renderGate(d.qualityGate));
  const m = isObj(d.metrics) ? d.metrics : {};
  const scopes = [['newCode', '새 코드'], ['overall', '전체 코드']].filter(([k]) => isObj(m[k]));

  if (!scopes.length) {
    sec.append(h('div', { class: 'subsection' }, stateBox('empty', '지표를 받지 못했어요')));
  } else {
    const body = h('div');
    const note = h('span', { class: 'section__note' });
    const buttons = scopes.map(([k, label]) => h('button', { type: 'button', 'aria-pressed': 'false', data: { scope: k } }, label));
    const show = (k) => {
      for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.scope === k));
      body.replaceChildren(renderStats(m[k], k));
      note.textContent = k === 'newCode' ? newCodeText(d.newCodeDefinition) : '';
    };
    for (const b of buttons) b.addEventListener('click', () => show(b.dataset.scope));
    sec.append(
      h('div', { class: 'scope-bar' },
        scopes.length > 1
          ? h('div', { class: 'toggle', role: 'group', 'aria-label': '지표 범위' }, buttons)
          : h('strong', null, scopes[0][1]),
        note),
      body);
    show(scopes[0][0]);
  }

  sec.append(renderTests(d.tests));
  return sec;
}

// ---------- Claude 리뷰 ----------

function renderClaude(d, ctx) {
  const sec = section('Claude 리뷰');
  if (!isObj(d.claude)) {
    sec.append(stateBox('empty', '이번 회차는 리뷰가 실행되지 않았어요'));
    return sec;
  }

  const findings = arr(d.claude.findings).filter(isObj);
  let counts = d.claude.counts;
  if (!isObj(counts)) {
    counts = {};
    for (const k of Object.keys(CATEGORY)) counts[k] = findings.filter((f) => f.category === k).length;
  }
  sec.append(h('div', { class: 'stats' }, Object.entries(CATEGORY).map(([k, label]) => stat(label, val(fmtInt(pick(counts, k)))))));

  if (!findings.length) {
    sec.append(h('div', { class: 'subsection' }, stateBox('empty', '지적 사항이 없어요')));
    return sec;
  }

  const rows = findings.slice().sort((a, b) => rank(b.severity) - rank(a.severity) || byLocation(a, b));
  sec.append(h('div', { class: 'subsection' }, filterTable({
    caption: 'Claude 리뷰 지적 목록',
    filters: [
      { label: '심각도', options: Object.entries(CLAUDE_SEV), match: (f, v) => f.severity === v },
      { label: '카테고리', options: Object.entries(CATEGORY), match: (f, v) => f.category === v },
    ],
    columns: [
      { label: '심각도', render: (f) => sevBadge(f.severity, CLAUDE_SEV) },
      { label: '카테고리', cls: 'nowrap', render: (f) => h('span', { class: 'chip' }, pick(CATEGORY, f.category) ?? str(f.category) ?? DASH) },
      { label: '위치', render: (f) => codeLocation(f, ctx) },
      { label: '내용', cls: 'message', render: (f) => val(str(f.message)) },
      { label: '처음 지적', cls: 'nowrap', render: (f) => val(fmtDate(f.firstSeen)) },
    ],
    rows,
  })));
  return sec;
}

// ---------- Sonar 이슈 ----------

/** 계약 보완안(impacts 배열)과 초안(quality + severity 한 쌍)을 둘 다 읽는다 */
function impactsOf(issue) {
  if (Array.isArray(issue.impacts)) {
    return issue.impacts.filter(isObj).map((i) => ({ quality: str(i.quality), severity: str(i.severity) }));
  }
  if (has(issue.quality) || has(issue.severity)) return [{ quality: str(issue.quality), severity: str(issue.severity) }];
  return [];
}

function renderSonar(d, ctx) {
  const sec = section('Sonar 이슈');
  if (!Array.isArray(d.sonarIssues)) {
    sec.append(stateBox('empty', '이번 회차는 이슈 목록을 받지 못했어요'));
    return sec;
  }

  const rows = d.sonarIssues.filter(isObj).map((issue) => {
    const impacts = impactsOf(issue);
    return { issue, impacts, rank: Math.max(0, ...impacts.map((x) => rank(x.severity))) };
  });
  if (!rows.length) {
    sec.append(stateBox('empty', '열린 이슈가 없어요'));
    return sec;
  }

  rows.sort((a, b) => b.rank - a.rank || byLocation(a.issue, b.issue));
  sec.append(filterTable({
    caption: 'Sonar 열린 이슈 목록',
    filters: [
      { label: '품질', options: Object.entries(QUALITY), match: (r, v) => r.impacts.some((x) => x.quality === v) },
      { label: '심각도', options: Object.entries(SONAR_SEV), match: (r, v) => r.impacts.some((x) => x.severity === v) },
    ],
    columns: [
      {
        label: '영향',
        render: (r) => (r.impacts.length
          ? h('div', { class: 'impacts' }, r.impacts.map((x) => h('div', { class: 'impact' },
            sevBadge(x.severity, SONAR_SEV),
            h('span', { class: 'chip' }, pick(QUALITY, x.quality) ?? x.quality ?? DASH))))
          : val(null)),
      },
      { label: '위치', render: (r) => codeLocation(r.issue, ctx) },
      { label: '내용', cls: 'message', render: (r) => val(str(r.issue.message)) },
      { label: '규칙', cls: 'mono nowrap', render: (r) => val(str(r.issue.rule)) },
    ],
    rows,
  }));
  return sec;
}

// ---------- 종합 의견 ----------

function renderOpinion(d) {
  const paragraphs = isObj(d.opinion)
    ? arr(d.opinion.paragraphs).filter((p) => typeof p === 'string' && p.trim() !== '')
    : [];
  if (!paragraphs.length) return null;
  const r = isObj(d.run) ? d.run : {};
  return section('종합 의견',
    h('div', { class: 'card opinion' },
      h('div', { class: 'opinion__note' },
        h('span', null, 'AI가 위 수치를 해석한 글이에요'),
        h('span', null, val(fmtTime(r.at)), ' · 커밋 ', val(shortSha(r.commit)))),
      paragraphs.map((p) => h('p', null, p))));
}

// ---------- 시작 ----------

async function main() {
  let base = '';
  if (preview) {
    const id = params.get('id');
    if (set === undefined) {
      app.replaceChildren(stateBox('error', '미리보기 주소에는 테스트 데이터 이름이 필요해요. 예: project-template.html?fixtures=v1&id=rehab'));
      return;
    }
    if (set === null || !isName(id)) {
      app.replaceChildren(stateBox('error', '미리보기 주소가 잘못됐어요. fixtures와 id는 영어 소문자, 숫자, 하이픈만 써요.'));
      return;
    }
    notices.append(fixturesBanner(set));
    base = `fixtures/${set}/projects/${id}/`;
  }

  let d;
  try {
    d = await loadJson(`${base}latest.json`);
  } catch (e) {
    app.replaceChildren(stateBox('error', '검사 결과를 불러오지 못했어요. ', loadErrorText(e)));
    return;
  }
  if (!isObj(d)) {
    app.replaceChildren(stateBox('error', '검사 결과 형식이 잘못됐어요.'));
    return;
  }

  const warn = versionBanner(d, 'latest.json');
  if (warn) notices.append(warn);

  const ctx = {
    repo: isObj(d.project) ? str(d.project.repo) : null,
    commit: isObj(d.run) ? str(d.run.commit) : null,
  };
  app.replaceChildren(...[
    renderHeader(d),
    renderOverview(d),
    renderClaude(d, ctx),
    renderSonar(d, ctx),
    renderOpinion(d),
  ].filter(Boolean));
}

main().catch((e) => {
  console.error(e);
  app.replaceChildren(stateBox('error', '화면을 그리다가 오류가 났어요.'));
});
