// 메인 대시보드 (index.html).
// 1) projects.json으로 요약 칸과 프로젝트 카드를 바로 그린다.
// 2) 프로젝트마다 latest.json, history.json을 더 읽어서 카드(이슈, 변화, 실패 조건)와 최근 검사 기록을 채운다.
//    이 파일들이 없어도 1)의 화면은 그대로 둔다.
import {
  h, arr, str, isObj, isNum, isName, val, DASH, fmtInt, fmtPercent, fmtTime, timeOf, relTime, shortSha,
  repoUrl, commitUrl, linkOrText, gateBadge, gateStatus, fixtureSet, loadJson, LoadError, loadErrorText,
  stateBox, fixturesBanner, versionBanner,
} from './common.js';

const set = fixtureSet();
const app = document.getElementById('app');
const notices = document.getElementById('notices');
const updated = document.getElementById('updated');
const dataSwitch = document.getElementById('data-switch');

const QUALITY = { reliability: '신뢰성', security: '보안', maintainability: '유지보수성' };
const GATE_FILTER = [['passed', '통과'], ['failed', '실패'], ['unknown', '판정 없음']];
const GATE_ORDER = { failed: 0, unknown: 1, passed: 2 };

// ---------- 정렬 ----------

/** 숫자 비교. 값이 없는 것은 항상 뒤로 */
function byNum(a, b, desc) {
  const x = isNum(a) ? a : null;
  const y = isNum(b) ? b : null;
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return desc ? y - x : x - y;
}

const byName = (a, b) => a.name.localeCompare(b.name, 'ko');

const SORTS = {
  recent: ['최신순', (a, b) => byNum(timeOf(a.p.lastRunAt), timeOf(b.p.lastRunAt), true) || byName(a, b)],
  name: ['이름순', byName],
  gate: ['게이트 실패 먼저', (a, b) => GATE_ORDER[gateStatus(a.p.qualityGate)] - GATE_ORDER[gateStatus(b.p.qualityGate)] || byNum(timeOf(a.p.lastRunAt), timeOf(b.p.lastRunAt), true)],
  coverage: ['커버리지 낮은 순', (a, b) => byNum(a.p.coverage, b.p.coverage, false) || byName(a, b)],
  findings: ['Claude 지적 많은 순', (a, b) => byNum(a.p.claudeFindings, b.p.claudeFindings, true) || byName(a, b)],
};

// ---------- 보는 방식 기억 (이 브라우저에만) ----------

function loadView() {
  try {
    return localStorage.getItem('cny.view') === 'table' ? 'table' : 'cards';
  } catch {
    return 'cards';
  }
}

function saveView(v) {
  try {
    localStorage.setItem('cny.view', v);
  } catch {
    // 저장 못 해도 화면은 그대로
  }
}

// ---------- 데이터 ----------

function projectHref(id) {
  if (!isName(id)) return null;
  return set ? `project-template.html?fixtures=${set}&id=${id}` : `projects/${id}/`;
}

function detailBase(id) {
  return set ? `fixtures/${set}/projects/${id}/` : `projects/${id}/`;
}

function toItem(p) {
  return {
    p,
    id: p.id,
    name: str(p.name) ?? str(p.id) ?? '이름 없음',
    repo: str(p.repo),
    href: projectHref(p.id),
    latest: null,
    history: null,
  };
}

async function loadDetail(item) {
  if (!isName(item.id)) return;
  const base = detailBase(item.id);
  const [latest, history] = await Promise.allSettled([loadJson(`${base}latest.json`), loadJson(`${base}history.json`)]);
  if (latest.status === 'fulfilled' && isObj(latest.value)) item.latest = latest.value;
  if (history.status === 'fulfilled' && isObj(history.value)) item.history = history.value;
}

/** history.json의 마지막 두 회차로 커버리지 변화 */
function coverageChange(item) {
  const runs = isObj(item.history) ? arr(item.history.runs).filter((r) => isObj(r) && isNum(r.coverage)) : [];
  if (runs.length < 2) return null;
  return Math.round((runs[runs.length - 1].coverage - runs[runs.length - 2].coverage) * 10) / 10;
}

function failedConditions(item) {
  const qg = isObj(item.latest) && isObj(item.latest.qualityGate) ? item.latest.qualityGate : null;
  return qg ? arr(qg.conditions).filter((c) => isObj(c) && c.status === 'failed').length : null;
}

function overallMetrics(item) {
  const m = isObj(item.latest) && isObj(item.latest.metrics) ? item.latest.metrics : null;
  return m && isObj(m.overall) ? m.overall : null;
}

// ---------- 작은 부품 ----------

function stat(label, value, ...sub) {
  return h('div', { class: 'stat' },
    h('span', { class: 'stat__label' }, label),
    h('span', { class: 'stat__value' }, value),
    sub.filter(Boolean).map((s) => h('span', { class: 'stat__sub' }, s)));
}

function delta(change) {
  if (change === null) return null;
  if (change === 0) return h('span', { class: 'delta', data: { dir: 'flat' }, title: '이전 회차와 같아요' }, '변화 없음');
  const up = change > 0;
  const text = `${Math.abs(change).toFixed(1)}%p`;
  return h('span', { class: 'delta', data: { dir: up ? 'up' : 'down' }, title: `이전 회차보다 ${text} ${up ? '올랐어요' : '내려갔어요'}` },
    `${up ? '▲' : '▼'} ${text}`);
}

function meter(v) {
  if (!isNum(v)) return null;
  const fill = h('span');
  fill.style.width = `${Math.min(100, Math.max(0, v))}%`;
  return h('div', { class: 'meter', 'aria-hidden': 'true' }, fill);
}

function ratingBadge(v) {
  return typeof v === 'string' && /^[A-E]$/.test(v)
    ? h('span', { class: 'rating rating--sm', data: { rating: v }, title: `등급 ${v}` }, v)
    : null;
}

function issueList(overall) {
  const issues = isObj(overall.issues) ? overall.issues : {};
  const ratings = isObj(overall.ratings) ? overall.ratings : {};
  return Object.entries(QUALITY).map(([q, label]) => h('span', { class: 'issue' },
    `${label} `, val(fmtInt(issues[q])), ratingBadge(ratings[q])));
}

function when(v) {
  const rel = relTime(v);
  return rel ? h('span', { title: fmtTime(v) }, rel) : val(null);
}

// ---------- 요약 칸 ----------

function renderSummary(items) {
  const ps = items.map((i) => i.p);
  const gates = { passed: 0, failed: 0, unknown: 0 };
  for (const p of ps) gates[gateStatus(p.qualityGate)]++;

  const covered = items.filter((i) => isNum(i.p.coverage));
  const avg = covered.length ? covered.reduce((s, i) => s + i.p.coverage, 0) / covered.length : null;
  const lowest = covered.slice().sort((a, b) => a.p.coverage - b.p.coverage)[0];

  const reviewed = ps.filter((p) => isNum(p.claudeFindings));
  const totalFindings = reviewed.reduce((s, p) => s + p.claudeFindings, 0);
  const notReviewed = ps.length - reviewed.length;

  const ran = items.filter((i) => timeOf(i.p.lastRunAt) !== null);
  const newest = ran.slice().sort((a, b) => timeOf(b.p.lastRunAt) - timeOf(a.p.lastRunAt))[0];

  const segbar = h('div', { class: 'segbar', 'aria-hidden': 'true' },
    Object.entries(gates).filter(([, n]) => n > 0).map(([s, n]) => {
      const seg = h('span', { data: { status: s } });
      seg.style.flexGrow = String(n);
      return seg;
    }));
  const legend = h('span', { class: 'legend' },
    GATE_FILTER.map(([s, label]) => h('span', { class: 'legend__item', data: { status: s } }, `${label} ${gates[s]}`)));

  return h('section', { class: 'section section--first', 'aria-label': '요약' },
    h('div', { class: 'stats stats--summary' },
      stat('등록된 프로젝트', String(ps.length), ran.length < ps.length ? `검사 전 ${ps.length - ran.length}개` : '모두 검사 기록 있음'),
      h('div', { class: 'stat' },
        h('span', { class: 'stat__label' }, '품질 게이트'),
        h('span', { class: 'stat__value' }, `통과 ${gates.passed}`, h('span', { class: 'stat__of' }, ` / ${ps.length}`)),
        segbar,
        legend),
      stat('평균 커버리지', val(fmtPercent(avg)), lowest ? `가장 낮음: ${lowest.name} ${fmtPercent(lowest.p.coverage)}` : null),
      stat('Claude 지적 합계', reviewed.length ? fmtInt(totalFindings) : val(null), notReviewed ? `리뷰 결과 없는 프로젝트 ${notReviewed}개` : '모든 프로젝트 리뷰 있음'),
      stat('마지막 검사', newest ? relTime(newest.p.lastRunAt) : val(null), newest ? `${newest.name} · ${fmtTime(newest.p.lastRunAt)}` : null)));
}

// ---------- 프로젝트 카드·표 ----------

function projectCard(item) {
  const { p } = item;
  const status = gateStatus(p.qualityGate);
  const failed = failedConditions(item);
  const overall = overallMetrics(item);
  const tests = isObj(item.latest) && isObj(item.latest.tests) ? item.latest.tests : null;
  const run = isObj(item.latest) && isObj(item.latest.run) ? item.latest.run : null;
  const sha = run ? str(run.commit) : null;
  const neverRan = timeOf(p.lastRunAt) === null && p.qualityGate == null && !isNum(p.coverage);

  const facts = [
    ['Claude 지적', val(fmtInt(p.claudeFindings))],
    overall ? ['이슈', issueList(overall)] : null,
    tests ? ['테스트', [`${fmtInt(tests.total) ?? DASH}개`, ' · 실패 ', val(fmtInt(tests.failed))]] : null,
  ].filter(Boolean);

  return h('article', { class: 'pcard', data: { status } },
    h('div', { class: 'pcard__head' },
      h('div', { class: 'pcard__title' },
        h('h3', null, linkOrText(item.name, item.href, item.href ? 'pcard__link' : null)),
        item.repo ? h('div', { class: 'sub' }, linkOrText(item.repo, repoUrl(item.repo))) : null),
      gateBadge(p.qualityGate)),
    failed ? h('p', { class: 'pcard__alert' }, `실패한 조건 ${failed}개`) : null,
    neverRan
      ? h('p', { class: 'pcard__empty' }, '아직 검사 기록이 없어요')
      : h('div', null,
        h('div', { class: 'pcard__cover' },
          h('span', { class: 'stat__label' }, '커버리지'),
          h('span', { class: 'pcard__big' }, val(fmtPercent(p.coverage))),
          delta(coverageChange(item))),
        meter(p.coverage)),
    h('dl', { class: 'facts' }, facts.map(([dt, dd]) => [h('dt', null, dt), h('dd', null, dd)])),
    h('div', { class: 'pcard__foot' },
      h('span', null, '마지막 검사 ', when(p.lastRunAt)),
      sha ? linkOrText(shortSha(sha), commitUrl(item.repo, sha), 'mono') : null));
}

function projectTable(items) {
  return h('div', { class: 'table-wrap' },
    h('table', { class: 'table' },
      h('caption', { class: 'visually-hidden' }, '등록된 프로젝트 목록'),
      h('thead', null, h('tr', null,
        h('th', { scope: 'col' }, '프로젝트'),
        h('th', { scope: 'col' }, '품질 게이트'),
        h('th', { scope: 'col', class: 'num' }, '커버리지'),
        h('th', { scope: 'col' }, '변화'),
        h('th', { scope: 'col', class: 'num' }, 'Claude 지적'),
        h('th', { scope: 'col' }, '이슈'),
        h('th', { scope: 'col' }, '마지막 검사'))),
      h('tbody', null, items.map((item) => {
        const overall = overallMetrics(item);
        return h('tr', null,
          h('td', null,
            linkOrText(item.name, item.href, 'project-name'),
            item.repo ? h('div', { class: 'sub' }, linkOrText(item.repo, repoUrl(item.repo))) : null),
          h('td', null, gateBadge(item.p.qualityGate)),
          h('td', { class: 'num' }, val(fmtPercent(item.p.coverage))),
          h('td', { class: 'nowrap' }, delta(coverageChange(item)) ?? val(null)),
          h('td', { class: 'num' }, val(fmtInt(item.p.claudeFindings))),
          h('td', null, overall ? h('div', { class: 'issues-inline' }, issueList(overall)) : val(null)),
          h('td', { class: 'nowrap' }, when(item.p.lastRunAt), h('div', { class: 'sub' }, val(fmtTime(item.p.lastRunAt)))));
      }))));
}

function projectsSection(items) {
  const state = { q: '', gate: '', sort: 'recent', view: loadView() };
  const count = h('span', { class: 'filters__count' });
  const body = h('div');

  const search = h('input', { type: 'search', placeholder: '이름이나 레포로 찾기', 'aria-label': '프로젝트 찾기' });
  const gateSel = h('select', null, h('option', { value: '' }, '전체'), GATE_FILTER.map(([v, l]) => h('option', { value: v }, l)));
  const sortSel = h('select', null, Object.entries(SORTS).map(([v, [l]]) => h('option', { value: v }, l)));
  const viewButtons = [['cards', '카드'], ['table', '표']].map(([v, l]) =>
    h('button', { type: 'button', 'aria-pressed': String(state.view === v), data: { view: v } }, l));

  function render() {
    const q = state.q.trim().toLowerCase();
    const shown = items
      .filter((i) => !q || [i.name, i.repo, i.id].some((t) => typeof t === 'string' && t.toLowerCase().includes(q)))
      .filter((i) => !state.gate || gateStatus(i.p.qualityGate) === state.gate)
      .sort(SORTS[state.sort][1]);
    count.textContent = `${items.length}개 중 ${shown.length}개`;
    for (const b of viewButtons) b.setAttribute('aria-pressed', String(b.dataset.view === state.view));
    if (!shown.length) body.replaceChildren(stateBox('empty', '조건에 맞는 프로젝트가 없어요'));
    else if (state.view === 'table') body.replaceChildren(projectTable(shown));
    else body.replaceChildren(h('div', { class: 'pcards' }, shown.map(projectCard)));
  }

  search.addEventListener('input', () => { state.q = search.value; render(); });
  gateSel.addEventListener('change', () => { state.gate = gateSel.value; render(); });
  sortSel.addEventListener('change', () => { state.sort = sortSel.value; render(); });
  for (const b of viewButtons) {
    b.addEventListener('click', () => { state.view = b.dataset.view; saveView(state.view); render(); });
  }

  render();
  const el = h('section', { class: 'section' },
    h('div', { class: 'section__head' }, h('h2', null, '프로젝트'),
      h('div', { class: 'toggle', role: 'group', 'aria-label': '보는 방식' }, viewButtons)),
    h('div', { class: 'filters toolbar' },
      search,
      h('label', null, '게이트', gateSel),
      h('label', null, '정렬', sortSel),
      count),
    body);
  return { el, render };
}

// ---------- 최근 검사 기록 ----------

function recentRuns(items) {
  const runs = [];
  for (const item of items) {
    const hist = isObj(item.history) ? arr(item.history.runs).filter(isObj) : [];
    if (hist.length) {
      hist.forEach((r, i) => {
        const prev = hist[i - 1];
        const change = prev && isNum(prev.coverage) && isNum(r.coverage) ? Math.round((r.coverage - prev.coverage) * 10) / 10 : null;
        runs.push({ item, at: r.at, gate: r.qualityGate, coverage: r.coverage, change, commit: str(r.commit) });
      });
    } else if (timeOf(item.p.lastRunAt) !== null) {
      const run = isObj(item.latest) && isObj(item.latest.run) ? item.latest.run : null;
      runs.push({ item, at: item.p.lastRunAt, gate: item.p.qualityGate, coverage: item.p.coverage, change: null, commit: run ? str(run.commit) : null });
    }
  }
  return runs.filter((r) => timeOf(r.at) !== null).sort((a, b) => timeOf(b.at) - timeOf(a.at)).slice(0, 10);
}

function recentSection() {
  const body = h('div', null, stateBox('loading', '검사 기록을 불러오는 중'));
  const el = h('section', { class: 'section' },
    h('div', { class: 'section__head' }, h('h2', null, '최근 검사'), h('span', { class: 'section__note' }, '모든 프로젝트, 최근 10회')),
    body);

  function fill(items) {
    const runs = recentRuns(items);
    if (!runs.length) {
      body.replaceChildren(stateBox('empty', '아직 검사 기록이 없어요'));
      return;
    }
    body.replaceChildren(h('div', { class: 'table-wrap' },
      h('table', { class: 'table' },
        h('caption', { class: 'visually-hidden' }, '최근 검사 기록'),
        h('thead', null, h('tr', null,
          h('th', { scope: 'col' }, '시각'),
          h('th', { scope: 'col' }, '프로젝트'),
          h('th', { scope: 'col' }, '품질 게이트'),
          h('th', { scope: 'col', class: 'num' }, '커버리지'),
          h('th', { scope: 'col' }, '변화'),
          h('th', { scope: 'col' }, '커밋'))),
        h('tbody', null, runs.map((r) => h('tr', null,
          h('td', { class: 'nowrap' }, when(r.at), h('div', { class: 'sub' }, val(fmtTime(r.at)))),
          h('td', null, linkOrText(r.item.name, r.item.href, 'project-name')),
          h('td', null, gateBadge(r.gate)),
          h('td', { class: 'num' }, val(fmtPercent(r.coverage))),
          h('td', { class: 'nowrap' }, delta(r.change) ?? val(null)),
          h('td', null, r.commit ? linkOrText(shortSha(r.commit), commitUrl(r.item.repo, r.commit), 'mono') : val(null))))))));
  }
  return { el, fill };
}

// ---------- 시작 ----------

async function main() {
  if (set === null) {
    app.replaceChildren(stateBox('error', '테스트 데이터 이름(fixtures)이 잘못됐어요. 영어 소문자, 숫자, 하이픈만 써요.'));
    return;
  }
  if (set) {
    notices.append(fixturesBanner(set));
    dataSwitch.textContent = '실제 데이터로 보기';
    dataSwitch.href = './';
  }

  let data;
  try {
    data = await loadJson(set ? `fixtures/${set}/projects.json` : 'projects.json');
  } catch (e) {
    if (e instanceof LoadError && e.kind === 'missing') {
      app.replaceChildren(stateBox('empty', '아직 검사된 프로젝트가 없어요'));
    } else {
      console.error(e);
      app.replaceChildren(stateBox('error', '목록을 불러오지 못했어요. ', loadErrorText(e)));
    }
    return;
  }

  const warn = versionBanner(data, 'projects.json');
  if (warn) notices.append(warn);
  const t = isObj(data) ? fmtTime(data.updatedAt) : null;
  updated.textContent = t ? `업데이트 ${t}` : '';

  const items = (isObj(data) ? arr(data.projects) : []).filter(isObj).map(toItem);
  if (!items.length) {
    app.replaceChildren(stateBox('empty', '아직 검사된 프로젝트가 없어요'));
    return;
  }

  const projects = projectsSection(items);
  const recent = recentSection();
  app.replaceChildren(renderSummary(items), projects.el, recent.el);

  await Promise.allSettled(items.map(loadDetail));
  projects.render();
  recent.fill(items);
}

main().catch((e) => {
  console.error(e);
  app.replaceChildren(stateBox('error', '화면을 그리다가 오류가 났어요.'));
});
