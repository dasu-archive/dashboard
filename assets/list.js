// 프로젝트 목록 화면 (index.html). projects.json을 읽어 표로 그린다.
import {
  h, arr, str, isObj, isName, val, fmtInt, fmtPercent, fmtTime,
  repoUrl, linkOrText, gateBadge, fixtureSet, loadJson, LoadError, loadErrorText,
  stateBox, fixturesBanner, versionBanner,
} from './common.js';

const set = fixtureSet();
const app = document.getElementById('app');
const notices = document.getElementById('notices');
const updated = document.getElementById('updated');
const dataSwitch = document.getElementById('data-switch');

function projectHref(id) {
  if (!isName(id)) return null;
  return set ? `project-template.html?fixtures=${set}&id=${id}` : `projects/${id}/`;
}

function row(p) {
  const name = str(p.name) ?? str(p.id) ?? '이름 없음';
  const repo = str(p.repo);
  return h('tr', null,
    h('td', null,
      linkOrText(name, projectHref(p.id), 'project-name'),
      repo ? h('div', { class: 'sub' }, linkOrText(repo, repoUrl(repo))) : null),
    h('td', null, gateBadge(p.qualityGate)),
    h('td', { class: 'num' }, val(fmtPercent(p.coverage))),
    h('td', { class: 'num' }, val(fmtInt(p.claudeFindings))),
    h('td', { class: 'nowrap' }, val(fmtTime(p.lastRunAt))));
}

function render(data) {
  const warn = versionBanner(data, 'projects.json');
  if (warn) notices.append(warn);

  const t = isObj(data) ? fmtTime(data.updatedAt) : null;
  updated.textContent = t ? `업데이트 ${t}` : '';

  const projects = isObj(data) ? arr(data.projects).filter(isObj) : [];
  if (!projects.length) {
    app.replaceChildren(stateBox('empty', '아직 검사된 프로젝트가 없어요'));
    return;
  }

  app.replaceChildren(h('div', { class: 'table-wrap' },
    h('table', { class: 'table' },
      h('caption', { class: 'visually-hidden' }, '검사한 프로젝트 목록'),
      h('thead', null, h('tr', null,
        h('th', { scope: 'col' }, '프로젝트'),
        h('th', { scope: 'col' }, '품질 게이트'),
        h('th', { scope: 'col', class: 'num' }, '커버리지'),
        h('th', { scope: 'col', class: 'num' }, 'Claude 지적'),
        h('th', { scope: 'col' }, '마지막 검사'))),
      h('tbody', null, projects.map(row)))));
}

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
  try {
    render(await loadJson(set ? `fixtures/${set}/projects.json` : 'projects.json'));
  } catch (e) {
    if (e instanceof LoadError && e.kind === 'missing') {
      app.replaceChildren(stateBox('empty', '아직 검사된 프로젝트가 없어요'));
    } else {
      console.error(e);
      app.replaceChildren(stateBox('error', '목록을 불러오지 못했어요. ', loadErrorText(e)));
    }
  }
}

main();
