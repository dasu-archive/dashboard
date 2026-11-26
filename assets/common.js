// 목록(index.html)과 프로젝트 화면(project-template.html)이 같이 쓰는 도구.
// 데이터에서 온 글자는 전부 텍스트 노드(textContent)로 넣는다. innerHTML은 쓰지 않는다.

export const KNOWN_SCHEMA = 1;
export const DASH = '—';

const NAME_RE = /^[a-z0-9-]+$/;
const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SHA_RE = /^[0-9a-f]{7,40}$/i;

/**
 * 요소 만들기. attrs의 키는 코드에서만 정한다(데이터로 정하지 않는다).
 *   class → className, data → dataset, 나머지 → setAttribute
 * 자식으로 문자열을 주면 텍스트 노드가 된다.
 */
export function h(tag, attrs, ...kids) {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value == null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'data') Object.assign(node.dataset, value);
      else node.setAttribute(key, value === true ? '' : String(value));
    }
  }
  for (const kid of kids.flat(2)) {
    if (kid == null || kid === false) continue;
    node.append(kid instanceof Node ? kid : String(kid));
  }
  return node;
}

// ---------- 값 다루기 ----------

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
export const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
export const arr = (v) => (Array.isArray(v) ? v : []);
export const str = (v) => (typeof v === 'string' && v !== '' ? v : null);
export const isName = (v) => typeof v === 'string' && NAME_RE.test(v);

export function fmtInt(v) {
  return isNum(v) ? Math.round(v).toLocaleString('ko-KR') : null;
}

export function fmtPercent(v) {
  return isNum(v) ? `${v.toFixed(1)}%` : null;
}

/** "2026-11-26T21:00:00+09:00" → "2026-11-26 21:00". 시간대는 바꾸지 않는다 */
export function fmtTime(v) {
  if (typeof v !== 'string' || v === '') return null;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(v);
  return m ? `${m[1]} ${m[2]}` : v;
}

export function fmtDate(v) {
  const t = fmtTime(v);
  return t && /^\d{4}-\d{2}-\d{2} /.test(t) ? t.slice(0, 10) : t;
}

export function shortSha(v) {
  if (typeof v !== 'string' || v === '') return null;
  return SHA_RE.test(v) ? v.slice(0, 7) : v;
}

/** 값이 없으면 흐린 "—" (0과 구분). 있으면 글자 그대로 */
export function val(text) {
  return text == null || text === '' ? h('span', { class: 'null', title: '값 없음' }, DASH) : String(text);
}

// ---------- GitHub 링크 ----------
// 주소는 항상 https://github.com/ 로 시작하게 만든다. 형식이 맞지 않으면 링크를 만들지 않는다.

export function repoUrl(repo) {
  return typeof repo === 'string' && REPO_RE.test(repo) ? `https://github.com/${repo}` : null;
}

export function commitUrl(repo, sha) {
  const base = repoUrl(repo);
  return base && typeof sha === 'string' && SHA_RE.test(sha) ? `${base}/commit/${sha}` : null;
}

export function fileUrl(repo, sha, file, line) {
  const base = repoUrl(repo);
  if (!base || typeof sha !== 'string' || !SHA_RE.test(sha)) return null;
  if (typeof file !== 'string' || file === '' || file.startsWith('/')) return null;
  const parts = file.split('/');
  if (parts.some((p) => p === '' || p === '.' || p === '..')) return null;
  const anchor = Number.isInteger(line) && line > 0 ? `#L${line}` : '';
  return `${base}/blob/${sha}/${parts.map(encodeURIComponent).join('/')}${anchor}`;
}

/** "/" 뒤에서 줄을 바꿀 수 있게 <wbr>을 끼운다 */
export function pathText(text) {
  const parts = String(text).split('/');
  return parts.flatMap((p, i) => (i < parts.length - 1 ? [p, '/', h('wbr')] : [p]));
}

export function linkOrText(content, url, cls) {
  return url ? h('a', { href: url, class: cls, rel: 'noopener' }, content) : h('span', { class: cls }, content);
}

// ---------- 품질 게이트 ----------

const GATE_TEXT = { passed: '통과', failed: '실패', unknown: '판정 없음' };

export function gateStatus(v) {
  return v === 'passed' || v === 'failed' ? v : 'unknown';
}

export function gateText(v) {
  return GATE_TEXT[gateStatus(v)];
}

export function gateBadge(v) {
  const s = gateStatus(v);
  return h('span', { class: 'gate', data: { status: s } }, GATE_TEXT[s]);
}

// ---------- 테스트 데이터 ----------

/** ?fixtures=v1 (또는 1) → 'v1'. 없으면 undefined, 형식이 틀리면 null */
export function fixtureSet(params = new URLSearchParams(location.search)) {
  if (!params.has('fixtures')) return undefined;
  const raw = params.get('fixtures');
  const set = raw === '1' ? 'v1' : raw;
  return isName(set) ? set : null;
}

// ---------- 불러오기 ----------

export class LoadError extends Error {
  constructor(kind, detail) {
    super(detail);
    this.kind = kind; // missing | http | parse | network
    this.detail = detail;
  }
}

export async function loadJson(url) {
  let res;
  try {
    res = await fetch(url, { cache: 'no-store' });
  } catch {
    throw new LoadError('network', '네트워크 오류');
  }
  if (res.status === 404) throw new LoadError('missing', '404');
  if (!res.ok) throw new LoadError('http', String(res.status));
  try {
    return await res.json();
  } catch {
    throw new LoadError('parse', 'JSON');
  }
}

export function loadErrorText(e) {
  if (!(e instanceof LoadError)) return '화면을 그리다가 오류가 났어요.';
  if (e.kind === 'missing') return '파일이 없어요 (404).';
  if (e.kind === 'http') return `서버가 ${e.detail}으로 응답했어요.`;
  if (e.kind === 'parse') return 'JSON 형식이 잘못됐어요.';
  return '네트워크에 연결하지 못했어요.';
}

// ---------- 알림 ----------

export function banner(kind, ...text) {
  return h('div', { class: 'banner', data: { kind }, role: kind === 'error' ? 'alert' : null }, ...text);
}

export function stateBox(state, ...text) {
  return h('div', { class: 'state', data: { state }, role: state === 'error' ? 'alert' : null }, ...text);
}

export function fixturesBanner(set) {
  return banner('info', `테스트 데이터(fixtures/${set})를 보고 있어요. 실제 검사 결과가 아니에요.`);
}

export function versionBanner(data, file) {
  const v = isObj(data) ? data.schemaVersion : undefined;
  if (v === KNOWN_SCHEMA) return null;
  const shown = v === undefined || v === null ? '없음' : String(v);
  return banner('warning', `${file}의 데이터 버전(schemaVersion ${shown})이 이 화면이 아는 버전(${KNOWN_SCHEMA})과 달라요. 아는 칸만 보여줘요.`);
}
