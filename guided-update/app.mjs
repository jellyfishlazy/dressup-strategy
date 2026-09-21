const { document } = globalThis;
const browserFetch = (...args) => globalThis.fetch(...args);
const qs = selector => document.querySelector(selector);

let token = null;
let state = null;
let latestDiff = null;
let latestReview = null;
let applyFingerprint = null;
let applyReportPath = null;
let closeoutFingerprint = null;
let wardrobeSearchState = null;

const SESSION_REQUIRED_ACTIONS = new Set([
  'wardrobe.search', 'wardrobe.collect', 'wardrobe.collect-search', 'wardrobe.remove',
  'levels.search', 'levels.collect', 'levels.remove',
  'completeness', 'diff', 'review', 'review.save', 'review.remove',
  'stage', 'apply.preview', 'apply.execute',
  'closeout.verify', 'closeout.complete',
]);

function node(tag, className = '', text = '') {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== '') element.textContent = text;
  return element;
}

function setBadge(selector, text, tone = '') {
  const badge = qs(selector);
  badge.textContent = text;
  badge.className = 'gu-badge' + (tone ? ' gu-badge-' + tone : '');
}

function setBusy(value) {
  document.body.classList.toggle('gu-busy', value);
}

function setSessionWorkflowAvailable(current) {
  const available = current?.status === 'draft';
  for (const section of document.querySelectorAll('[data-requires-session]')) {
    section.classList.toggle('gu-step-locked', !available);
    if (available) section.removeAttribute('aria-disabled');
    else section.setAttribute('aria-disabled', 'true');

    const notice = section.querySelector('.gu-prerequisite');
    if (notice) notice.hidden = available;

    for (const control of section.querySelectorAll('button, input, select, textarea')) {
      if (!available) {
        if (!control.disabled) {
          control.disabled = true;
          control.dataset.sessionPrerequisiteDisabled = 'true';
        }
      } else if (control.dataset.sessionPrerequisiteDisabled === 'true') {
        control.disabled = false;
        delete control.dataset.sessionPrerequisiteDisabled;
      }
    }
  }
}

function showMessage(kind, message) {
  const error = qs('#global-error');
  const success = qs('#global-success');
  error.hidden = true;
  success.hidden = true;
  const target = kind === 'error' ? error : success;
  target.textContent = kind === 'error' ? '操作無法完成：' + message : message;
  target.hidden = false;
  globalThis.clearTimeout(showMessage.timer);

  if (kind === 'error') {
    target.tabIndex = -1;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.focus({ preventScroll: true });
    return;
  }

  target.removeAttribute('tabindex');
  showMessage.timer = globalThis.setTimeout(() => {
    target.hidden = true;
  }, 5000);
}

function log(message, kind = '') {
  const item = node('li', kind ? 'gu-log-' + kind : '');
  const time = node('time', '', new Date().toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }));
  item.append(time, document.createTextNode(message));
  qs('#activity-log').prepend(item);
}

async function decodeResponse(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || '本機更新服務回傳錯誤');
  }
  return payload;
}

async function api(action, payload = {}) {
  if (!token) throw new Error('Guided Update token 尚未就緒');
  if (SESSION_REQUIRED_ACTIONS.has(action) && state?.current?.status !== 'draft') {
    throw new Error('請先完成 Step 1：建立或啟用一個進行中的「本次更新」。');
  }
  const response = await browserFetch('/__guided_update_api', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Guided-Update-Token': token,
    },
    body: JSON.stringify({ action, payload }),
  });
  return (await decodeResponse(response)).result;
}

async function refreshState() {
  state = await api('state');
  renderState();
  return state;
}

function formatDate(value) {
  if (!value) return '－';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('zh-TW');
}

function currentWardrobeFilters() {
  return {
    query: qs('#wardrobe-query').value.trim(),
    name: '',
    category: qs('#wardrobe-category').value,
    suit: qs('#wardrobe-suit').value.trim(),
    version: qs('#wardrobe-version').value.trim(),
    source: qs('#wardrobe-source').value.trim(),
    cnOnly: qs('#wardrobe-cn-only').checked,
  };
}

function populateWardrobeCategories(categories) {
  const select = qs('#wardrobe-category');
  const current = select.value;
  select.replaceChildren();
  const all = node('option', '', '全部');
  all.value = '';
  select.append(all);
  for (const entry of categories || []) {
    const option = node('option', '', entry.value + ' (' + entry.count + ')');
    option.value = entry.value;
    select.append(option);
  }
  if ([...select.options].some(option => option.value === current)) select.value = current;
}

function resetWardrobeSearch() {
  wardrobeSearchState = null;
  qs('#wardrobe-search-summary').textContent = '尚未搜尋';
  qs('#wardrobe-add-all').disabled = true;
  qs('#wardrobe-add-all').textContent = '加入全部符合項目';
  qs('#wardrobe-search-more').hidden = true;
  qs('#wardrobe-results').className = 'gu-results gu-empty';
  qs('#wardrobe-results').textContent = '尚未搜尋';
}

function invalidateWardrobeSearchForChangedFilters() {
  if (!wardrobeSearchState) return;
  resetWardrobeSearch();
  qs('#wardrobe-search-summary').textContent = '搜尋條件已變更，請重新搜尋';
  qs('#wardrobe-results').textContent = '條件已變更，按「搜尋」取得新的結果。';
}

function assertWardrobeSearchPayload(result) {
  const valid = result
    && typeof result === 'object'
    && Number.isSafeInteger(result.total)
    && Number.isSafeInteger(result.addable)
    && Number.isSafeInteger(result.alreadyCollected)
    && Number.isSafeInteger(result.nonselectable)
    && typeof result.searchFingerprint === 'string'
    && /^[0-9a-f]{64}$/i.test(result.searchFingerprint)
    && result.filters && typeof result.filters === 'object'
    && Array.isArray(result.categories)
    && Array.isArray(result.items);

  if (!valid) {
    throw new Error(
      'Guided Update 前後端版本不一致。請關閉目前頁面，重新執行「開啟資料更新.bat」後再搜尋。',
    );
  }
}

function renderWardrobeSearch(result, { append = false } = {}) {
  assertWardrobeSearchPayload(result);
  if (!append || !wardrobeSearchState
    || wardrobeSearchState.searchFingerprint !== result.searchFingerprint) {
    wardrobeSearchState = {
      sessionId: result.sessionId,
      filters: result.filters,
      searchFingerprint: result.searchFingerprint,
      items: [],
      nextOffset: 0,
      total: result.total,
      addable: result.addable,
      alreadyCollected: result.alreadyCollected,
      nonselectable: result.nonselectable,
    };
  }

  wardrobeSearchState.items.push(...result.items);
  wardrobeSearchState.nextOffset = result.offset + result.items.length;
  wardrobeSearchState.total = result.total;
  wardrobeSearchState.addable = result.addable;
  wardrobeSearchState.alreadyCollected = result.alreadyCollected;
  wardrobeSearchState.nonselectable = result.nonselectable;

  populateWardrobeCategories(result.categories);
  renderSearchResults('#wardrobe-results', { items: wardrobeSearchState.items }, 'wardrobe');

  const summary = [
    '符合 ' + result.total + ' 筆',
    '可加入 ' + result.addable + ' 筆',
    '已加入 ' + result.alreadyCollected + ' 筆',
  ];
  if (result.nonselectable) summary.push('不可加入 ' + result.nonselectable + ' 筆');
  qs('#wardrobe-search-summary').textContent = summary.join('｜');

  const addAll = qs('#wardrobe-add-all');
  addAll.disabled = result.addable === 0;
  addAll.textContent = result.addable > 0
    ? '加入全部 ' + result.addable + ' 筆'
    : '目前結果皆已加入';

  qs('#wardrobe-search-more').hidden = !result.hasMore;
}

async function runWardrobeSearch({ append = false } = {}) {
  const filters = append && wardrobeSearchState
    ? wardrobeSearchState.filters
    : currentWardrobeFilters();
  const result = await api('wardrobe.search', {
    filters,
    offset: append && wardrobeSearchState ? wardrobeSearchState.nextOffset : 0,
    limit: 50,
  });
  renderWardrobeSearch(result, { append });
  return result;
}

async function refreshWardrobeSearchIfPresent() {
  if (!wardrobeSearchState) return;
  const previousFilters = wardrobeSearchState.filters;
  const result = await api('wardrobe.search', {
    filters: previousFilters,
    offset: 0,
    limit: 50,
  });
  renderWardrobeSearch(result);
}

function renderState() {
  const current = state?.current || null;
  if (wardrobeSearchState && wardrobeSearchState.sessionId !== current?.id) resetWardrobeSearch();
  setSessionWorkflowAvailable(current);
  const form = qs('#create-session-form');
  const panel = qs('#current-session');
  const sourcePanel = qs('#source-readiness');
  const createButton = qs('#create-session-button');
  const source = state?.source || { ready: false, error: '來源狀態未知' };

  sourcePanel.replaceChildren();
  sourcePanel.className = 'gu-source-readiness ' + (source.ready ? 'is-ready' : 'is-missing');
  if (source.ready) {
    sourcePanel.append(
      node('strong', '', '外部來源已就緒'),
      node('div', 'gu-item-meta', source.sourceRoot
        ? '來源根目錄：' + source.sourceRoot
        : '服裝與關卡來源使用不同目錄'),
    );
  } else {
    sourcePanel.append(
      node('strong', '', '外部來源尚未就緒'),
      node('div', 'gu-item-meta', source.error || '找不到來源檔案'),
      node('div', 'gu-item-meta', '請先準備來源資料或設定 CN_WARDROBE_JS / CN_LEVELS_JS，再重新啟動 Guided Update。'),
    );
  }
  createButton.disabled = !source.ready;

  if (!current) {
    panel.hidden = true;
    form.hidden = false;
    setBadge('#session-badge', '尚未建立');
    setBadge('#collection-badge', '0 項');
    setBadge('#completeness-badge', '未檢查');
  } else {
    form.hidden = true;
    panel.hidden = false;
    panel.replaceChildren();

    const info = node('div');
    const title = node('strong', '', current.name);
    const meta = node('div', 'gu-session-meta');
    meta.append(
      node('span', '', '狀態：' + current.status),
      node('span', '', '建立：' + formatDate(current.createdAt)),
      node('span', '', '更新：' + formatDate(current.updatedAt)),
    );
    if (current.note) meta.append(node('span', '', '備註：' + current.note));
    info.append(title, meta);
    panel.append(info);

    if (current.status === 'draft') {
      const cancel = node('button', 'ui-btn ui-btn-sm ui-btn-default', '取消本次更新');
      cancel.type = 'button';
      cancel.addEventListener('click', async () => {
        if (!globalThis.confirm('確定取消這次更新？已收集的 Session 資料會保留為 cancelled 紀錄。')) return;
        await runAction('取消本次更新', async () => {
          await api('session.cancel', { id: current.id });
          latestDiff = null;
          latestReview = null;
          resetApplyState();
          resetCloseoutState();
          await refreshState();
        });
      });
      panel.append(cancel);
    }

    setBadge(
      '#session-badge',
      current.status === 'draft' ? '進行中' : current.status,
      current.status === 'draft' ? 'success' : '',
    );
  }

  const wardrobe = state?.collection?.wardrobe || [];
  const levels = state?.collection?.levels || [];
  qs('#wardrobe-count').textContent = String(wardrobe.length);
  qs('#levels-count').textContent = String(levels.length);
  setBadge('#collection-badge', (wardrobe.length + levels.length) + ' 項');
  renderSelected('#wardrobe-selected', wardrobe, 'wardrobe.remove');
  renderSelected('#levels-selected', levels, 'levels.remove');
  renderSessions();
  renderCompleteness(state?.completeness || null);

  if (state?.latestApplyReport?.path) {
    applyReportPath = state.latestApplyReport.path;
  }
}

function renderSessions() {
  const root = qs('#session-list');
  root.replaceChildren();
  const sessions = state?.sessions || [];
  if (!sessions.length) {
    root.className = 'gu-list gu-empty';
    root.textContent = '尚無歷史紀錄';
    return;
  }
  root.className = 'gu-list';
  for (const session of sessions) {
    const item = node('div', 'gu-history-item');
    const main = node('div');
    main.append(
      node('strong', '', session.name),
      node('div', 'gu-item-meta', session.status + ' ・ ' + formatDate(session.updatedAt)),
    );
    item.append(main);
    if (session.status === 'draft' && session.id !== state?.current?.id) {
      const button = node('button', 'ui-btn ui-btn-xs ui-btn-default', '設為目前更新');
      button.type = 'button';
      button.addEventListener('click', () => runAction('切換更新 Session', async () => {
        await api('session.activate', { id: session.id });
        latestDiff = null;
        latestReview = null;
        resetApplyState();
        resetCloseoutState();
        await refreshState();
      }));
      item.append(button);
    }
    root.append(item);
  }
}

function renderSelected(selector, items, removeAction) {
  const root = qs(selector);
  root.replaceChildren();
  if (!items.length) {
    root.className = 'gu-selected-list gu-empty';
    root.textContent = selector.includes('wardrobe') ? '尚無服裝' : '尚無關卡';
    return;
  }
  root.className = 'gu-selected-list';
  for (const item of items) {
    const row = node('div', 'gu-selected-item');
    const main = node('div');
    main.append(
      node('strong', '', item.name || item.runtimeLabel || item.key),
      node('div', 'gu-item-meta', item.key),
    );
    const remove = node('button', 'ui-btn ui-btn-xs ui-btn-default', '移除');
    remove.type = 'button';
    remove.addEventListener('click', () => runAction('移除 ' + item.key, async () => {
      await api(removeAction, { keys: [item.key] });
      latestDiff = null;
      latestReview = null;
      resetApplyState();
      resetCloseoutState();
      await refreshState();
      if (removeAction === 'wardrobe.remove') await refreshWardrobeSearchIfPresent();
    }));
    row.append(main, remove);
    root.append(row);
  }
}

function renderCompleteness(result) {
  const metrics = qs('#completeness-summary').children;
  const overall = result?.overall;
  metrics[0].querySelector('strong').textContent = String(overall?.planned ?? 0);
  metrics[1].querySelector('strong').textContent = String(overall?.completed ?? 0);
  metrics[2].querySelector('strong').textContent = String(overall?.missing ?? 0);
  metrics[3].querySelector('strong').textContent =
    overall?.percent == null ? '－' : overall.percent + '%';

  if (!result?.planDefined) setBadge('#completeness-badge', '尚未列入項目', 'warning');
  else if (result.complete) setBadge('#completeness-badge', '完整', 'success');
  else setBadge('#completeness-badge', '缺 ' + result.overall.missing + ' 項', 'warning');

  const missing = [
    ...(result?.wardrobe?.missingItems || []).map(item => ({
      label: item.name || item.key,
      key: item.key,
      domain: '服裝',
    })),
    ...(result?.levels?.missingItems || []).map(item => ({
      label: item.runtimeLabel || item.key,
      key: item.key,
      domain: '關卡',
    })),
  ];
  const root = qs('#missing-items');
  root.replaceChildren();
  if (!missing.length) {
    root.className = 'gu-list gu-empty';
    root.textContent = result?.planDefined ? '沒有缺少項目' : '尚未建立預計清單';
    return;
  }
  root.className = 'gu-list';
  for (const item of missing) {
    root.append(node('div', 'gu-output', item.domain + '｜' + item.label + '｜' + item.key));
  }
}

function renderSearchResults(selector, result, domain) {
  const root = qs(selector);
  root.replaceChildren();
  if (!result?.items?.length) {
    root.className = 'gu-results gu-empty';
    root.textContent = '找不到符合項目';
    return;
  }
  root.className = 'gu-results';
  for (const item of result.items) {
    const row = node('div', 'gu-result');
    const main = node('div', 'gu-result-main');
    const label = domain === 'wardrobe' ? item.name : item.runtimeLabel;
    const meta = domain === 'wardrobe'
      ? [item.displayKey || item.key, item.suit, item.source, item.tags, item.version]
        .filter(Boolean).join(' ・ ')
      : [item.key, ...(item.themeFilter || []).map(group => group.name)].filter(Boolean).join(' ・ ');
    main.append(node('strong', '', label || item.key), node('div', 'gu-result-meta', meta));
    if (domain === 'wardrobe') {
      if (item.sourceOnly) {
        main.append(node('div', 'gu-result-meta gu-result-source-only', '外部獨有'));
      }
      const original = item.original || {};
      const originalBits = [];
      if (original.name && original.name !== item.name) originalBits.push(original.name);
      if (original.category && original.category !== item.category) originalBits.push(original.category);
      if (original.suit && original.suit !== item.suit) originalBits.push(original.suit);
      if (original.source && original.source !== item.source) originalBits.push(original.source);
      if (originalBits.length) {
        main.append(node('div', 'gu-result-meta gu-result-original', '原始：' + originalBits.join(' ・ ')));
      }
    }
    if (item.warnings?.length) {
      main.append(node('div', 'gu-result-meta', '⚠ ' + item.warnings.map(w => w.message || w.kind || String(w)).join('；')));
    }

    const button = node(
      'button',
      'ui-btn ui-btn-xs ' + (item.collected ? 'ui-btn-default' : 'ui-btn-success'),
      item.collected ? '已加入' : '加入本次更新',
    );
    button.type = 'button';
    button.disabled = item.collected || !item.selectable;
    button.addEventListener('click', () => runAction('加入 ' + item.key, async () => {
      await api(domain === 'wardrobe' ? 'wardrobe.collect' : 'levels.collect', {
        keys: [item.key],
      });
      latestDiff = null;
      latestReview = null;
      resetApplyState();
      resetCloseoutState();
      await refreshState();
      if (domain === 'wardrobe') {
        await refreshWardrobeSearchIfPresent();
      } else {
        button.disabled = true;
        button.textContent = '已加入';
      }
    }));
    row.append(main, button);
    root.append(row);
  }
}

function renderDiff(result) {
  latestDiff = result;
  const values = [
    result?.summary?.new || 0,
    result?.summary?.modified || 0,
    result?.summary?.conflict || 0,
    result?.summary?.unchanged || 0,
    result?.summary?.total || 0,
  ];
  [...qs('#diff-summary').children].forEach((item, index) => {
    item.querySelector('strong').textContent = String(values[index]);
  });
  setBadge(
    '#review-badge',
    result?.summary?.conflict ? result.summary.conflict + ' 個衝突' : '無衝突',
    result?.summary?.conflict ? 'warning' : 'success',
  );
}

function conflictDiffItem(conflict) {
  return [
    ...(latestDiff?.wardrobe?.items || []),
    ...(latestDiff?.levels?.items || []),
  ].find(item => item.domain === conflict.domain && item.sourceKey === conflict.sourceKey);
}

function manualTemplate(conflict) {
  const item = conflictDiffItem(conflict);
  if (!item) return {};
  if (conflict.domain === 'wardrobe') {
    return {
      kind: 'wardrobe-row',
      targetKey: item.targetKey,
      row: item.candidateRow || item.baselineRow || [],
    };
  }
  const candidate = item.candidate || {};
  const entries = [];
  if (item.targetKey && candidate.levelsRaw) {
    entries.push({ table: 'levelsRaw', key: item.targetKey, value: candidate.levelsRaw });
  }
  for (const [table, field] of [
    ['levelFilters', 'levelFilters'],
    ['levelBonus', 'levelBonus'],
    ['addSkillsInfo', 'skills'],
    ['addHintInfo', 'hint'],
  ]) {
    if (candidate[field] != null) {
      entries.push({ table, key: item.targetKey, value: candidate[field] });
    }
  }
  for (const theme of candidate.themeFilter || []) {
    entries.push({ table: 'themeFilter', key: theme.name, value: theme.prefix });
  }
  return { kind: 'level-entries', targetKey: item.targetKey, entries };
}

function renderReview(review) {
  latestReview = review;
  const root = qs('#conflict-list');
  root.replaceChildren();
  if (!review?.conflicts?.length) {
    root.className = 'gu-conflicts gu-empty';
    root.textContent = '沒有需要人工審查的衝突';
    setBadge('#review-badge', '審查完成', 'success');
    return;
  }

  root.className = 'gu-conflicts';
  for (const conflict of review.conflicts) {
    const card = node('article', 'gu-conflict');
    const heading = node('div', 'gu-conflict-title');
    const title = node('div');
    title.append(
      node('strong', '', (conflict.domain === 'wardrobe' ? '服裝' : '關卡') + '｜' + conflict.sourceKey),
      node('div', 'gu-conflict-meta',
        'Target: ' + (conflict.targetKey || '未對應') + ' ・ ' + conflict.conflictKind),
    );
    heading.append(title);
    if (conflict.reviewed) heading.append(node('span', 'gu-badge gu-badge-success', '已審查'));
    else heading.append(node('span', 'gu-badge gu-badge-warning', '待處理'));
    card.append(heading);

    const details = node('ul', 'gu-diff-list');
    for (const reason of conflict.reasons || []) details.append(node('li', '', reason));
    for (const diff of conflict.differences || []) {
      details.append(node('li', '',
        diff.field
          ? diff.field + '：' + JSON.stringify(diff.before) + ' → ' + JSON.stringify(diff.after)
          : diff.table + '|' + diff.key,
      ));
    }
    for (const item of conflict.conflicts || []) {
      details.append(node('li', '', item.kind + (item.table ? '｜' + item.table : '')));
    }
    if (details.children.length) card.append(details);

    if (conflict.decision) {
      card.append(node('div', 'gu-conflict-meta',
        '目前決策：' + conflict.decision.decision + '（' + conflict.decision.state + '）'
      ));
    }

    const actions = node('div', 'gu-conflict-actions');
    const keep = node('button', 'ui-btn ui-btn-sm ui-btn-default', '保留本地');
    const source = node('button', 'ui-btn ui-btn-sm ui-btn-info', '採用來源');
    const manual = node('button', 'ui-btn ui-btn-sm ui-btn-default', '手動調整 JSON');
    keep.type = source.type = manual.type = 'button';
    keep.addEventListener('click', () => saveDecision(conflict, 'keep-local'));
    source.addEventListener('click', () => saveDecision(conflict, 'use-source'));
    actions.append(keep, source, manual);
    card.append(actions);

    const manualBox = node('div', 'gu-manual-resolution');
    manualBox.hidden = true;
    const textarea = node('textarea', 'ui-control');
    textarea.value = JSON.stringify(manualTemplate(conflict), null, 2);
    const save = node('button', 'ui-btn ui-btn-sm ui-btn-success', '儲存手動決策');
    save.type = 'button';
    manual.addEventListener('click', () => {
      manualBox.hidden = !manualBox.hidden;
      if (!manualBox.hidden) textarea.focus();
    });
    save.addEventListener('click', async () => {
      let resolvedPayload;
      try {
        resolvedPayload = JSON.parse(textarea.value);
      } catch (error) {
        showMessage('error', '手動 JSON 格式錯誤：' + error.message);
        return;
      }
      await saveDecision(conflict, 'manual-resolution', resolvedPayload);
    });
    manualBox.append(textarea, save);
    card.append(manualBox);
    root.append(card);
  }

  if (review.readyForNextGate) setBadge('#review-badge', '審查完成', 'success');
  else setBadge('#review-badge', '待處理 ' + review.unresolvedCount + ' 項', 'warning');
}

async function saveDecision(conflict, decision, resolvedPayload = undefined) {
  await runAction('儲存衝突決策：' + conflict.sourceKey, async () => {
    await api('review.save', {
      domain: conflict.domain,
      sourceKey: conflict.sourceKey,
      decision,
      ...(resolvedPayload === undefined ? {} : { resolvedPayload }),
    });
    const review = await api('review');
    renderReview(review);
    resetApplyState();
    resetCloseoutState();
    await refreshState();
  });
}

function resetApplyState() {
  applyFingerprint = null;
  applyReportPath = null;
  qs('#execute-apply').disabled = true;
  qs('#apply-fingerprint-wrap').hidden = true;
  qs('#apply-summary').className = 'gu-output gu-empty';
  qs('#apply-summary').textContent = '先完成差異審查，再執行 Preview。';
  setBadge('#apply-badge', '尚未 Preview');
}

function resetCloseoutState() {
  closeoutFingerprint = null;
  qs('#complete-closeout').disabled = true;
  qs('#closeout-fingerprint-wrap').hidden = true;
  qs('#closeout-summary').className = 'gu-output gu-empty';
  qs('#closeout-summary').textContent = '成功 Apply 後再進行驗證。';
  setBadge('#closeout-badge', '尚未驗證');
}

async function runAction(label, task) {
  setBusy(true);
  try {
    const result = await task();
    log(label + '：完成', 'success');
    showMessage('success', label + '完成');
    return result;
  } catch (error) {
    console.warn('[Guided Update]', error);
    log(label + '：' + error.message, 'error');
    showMessage('error', error.message);
    return null;
  } finally {
    setBusy(false);
  }
}

qs('#create-session-form').addEventListener('submit', event => {
  event.preventDefault();
  runAction('建立本次更新', async () => {
    await api('session.create', {
      name: qs('#session-name').value.trim(),
      note: qs('#session-note').value.trim(),
    });
    qs('#create-session-form').reset();
    latestDiff = null;
    latestReview = null;
    resetApplyState();
    resetCloseoutState();
    await refreshState();
  });
});

qs('#wardrobe-search-form').addEventListener('submit', event => {
  event.preventDefault();
  runAction('搜尋服裝', () => runWardrobeSearch());
});

for (const selector of [
  '#wardrobe-query',
  '#wardrobe-suit',
  '#wardrobe-version',
  '#wardrobe-source',
]) {
  qs(selector).addEventListener('input', invalidateWardrobeSearchForChangedFilters);
}
qs('#wardrobe-category').addEventListener('change', invalidateWardrobeSearchForChangedFilters);
qs('#wardrobe-cn-only').addEventListener('change', invalidateWardrobeSearchForChangedFilters);

qs('#wardrobe-search-more').addEventListener('click', () => {
  if (!wardrobeSearchState) return;
  runAction('顯示更多服裝', () => runWardrobeSearch({ append: true }));
});

qs('#wardrobe-add-all').addEventListener('click', async () => {
  if (!wardrobeSearchState || wardrobeSearchState.addable <= 0) return;
  if (wardrobeSearchState.addable > 500
    && !globalThis.confirm('將加入 ' + wardrobeSearchState.addable + ' 筆符合項目，確定？')) return;

  const result = await runAction('加入全部符合服裝', () => api('wardrobe.collect-search', {
    filters: wardrobeSearchState.filters,
    searchFingerprint: wardrobeSearchState.searchFingerprint,
  }));
  if (!result) return;

  latestDiff = null;
  latestReview = null;
  resetApplyState();
  resetCloseoutState();
  await refreshState();
  await refreshWardrobeSearchIfPresent();

  const summary = [
    '新加入 ' + result.added + ' 筆',
    '已存在 ' + result.alreadyCollected + ' 筆',
  ];
  if (result.nonselectable) summary.push('不可加入 ' + result.nonselectable + ' 筆');
  if (result.skippedDuringCollect) summary.push('競合略過 ' + result.skippedDuringCollect + ' 筆');
  showMessage('success', summary.join('｜'));
});

qs('#levels-search-form').addEventListener('submit', event => {
  event.preventDefault();
  runAction('搜尋關卡', async () => {
    const result = await api('levels.search', {
      query: qs('#levels-query').value.trim(),
      limit: 50,
    });
    renderSearchResults('#levels-results', result, 'levels');
  });
});

qs('#check-completeness').addEventListener('click', () => runAction('完整度檢查', async () => {
  const result = await api('completeness');
  renderCompleteness(result);
  await refreshState();
}));

qs('#run-diff').addEventListener('click', () => runAction('產生差異預覽', async () => {
  const diff = await api('diff');
  renderDiff(diff);
  const review = await api('review');
  renderReview(review);
}));

qs('#refresh-review').addEventListener('click', () => runAction('重新讀取審查狀態', async () => {
  const review = await api('review');
  renderReview(review);
}));

qs('#generate-stage').addEventListener('click', () => runAction('產生 Staging', async () => {
  const result = await api('stage');
  qs('#apply-summary').className = 'gu-output';
  qs('#apply-summary').textContent =
    'Staging ' + (result.reused ? '已重用' : '已產生')
    + '｜Fingerprint：' + result.generationFingerprint;
  setBadge('#apply-badge', 'Staging Ready', 'success');
}));

qs('#preview-apply').addEventListener('click', () => runAction('執行 Apply Preview', async () => {
  const result = await api('apply.preview');
  applyFingerprint = result.confirmFingerprint;
  applyReportPath = result.reportPath;
  qs('#apply-fingerprint').textContent = applyFingerprint;
  qs('#apply-fingerprint-wrap').hidden = false;
  qs('#execute-apply').disabled = !result.readyForApply;
  qs('#apply-summary').className = 'gu-output';
  qs('#apply-summary').textContent =
    'Preview：' + result.status
    + '｜Wardrobe：' + JSON.stringify(result.preview?.wardrobe?.summary || {})
    + '｜Levels：' + JSON.stringify(result.preview?.levels?.summary || {});
  setBadge('#apply-badge', result.readyForApply ? '可 Apply' : result.status,
    result.readyForApply ? 'success' : 'warning');
}));

qs('#execute-apply').addEventListener('click', () => {
  if (!applyFingerprint) return;
  if (!globalThis.confirm('確定正式 Apply？這一步會寫入 canonical 資料，失敗時由 Gate 11F rollback。')) return;
  runAction('正式 Apply', async () => {
    const result = await api('apply.execute', { confirm: applyFingerprint });
    applyReportPath = result.reportPath;
    qs('#execute-apply').disabled = true;
    qs('#apply-summary').textContent =
      'Apply：' + result.status + '｜Changed：'
      + JSON.stringify(result.gate11?.changedSourceIds || []);
    setBadge('#apply-badge', 'Applied', 'success');
    resetCloseoutState();
    await refreshState();
  });
});

qs('#verify-closeout').addEventListener('click', () => runAction('驗證 Apply 結果', async () => {
  const result = await api('closeout.verify', {
    ...(applyReportPath ? { applyReportPath } : {}),
  });
  closeoutFingerprint = result.closeoutFingerprint;
  qs('#closeout-fingerprint').textContent = closeoutFingerprint;
  qs('#closeout-fingerprint-wrap').hidden = false;
  qs('#complete-closeout').disabled = !result.readyToComplete;
  qs('#closeout-summary').className = 'gu-output';
  qs('#closeout-summary').textContent =
    '驗證：' + result.status + '｜'
    + '服裝確認 ' + (result.semantics?.wardrobe?.stagedRowsVerified ?? 0) + ' 筆｜'
    + '關卡確認 ' + (result.semantics?.levels?.stagedEntriesVerified ?? 0) + ' 筆';
  setBadge('#closeout-badge', '驗證通過', 'success');
}));

qs('#complete-closeout').addEventListener('click', () => {
  if (!closeoutFingerprint) return;
  if (!globalThis.confirm('確定完成本次更新？完成後 Session 會封存為 completed。')) return;
  runAction('完成本次更新', async () => {
    const result = await api('closeout.complete', {
      confirm: closeoutFingerprint,
      ...(applyReportPath ? { applyReportPath } : {}),
    });
    setBadge('#closeout-badge', 'Completed', 'success');
    qs('#closeout-summary').textContent = 'Session 已完成：' + result.session.name;
    qs('#complete-closeout').disabled = true;
    await refreshState();
  });
});

qs('#refresh-state').addEventListener('click', () => runAction('重新整理', refreshState));
qs('#clear-log').addEventListener('click', () => qs('#activity-log').replaceChildren());

async function bootstrap() {
  setBusy(true);
  try {
    const response = await browserFetch('/__guided_update_bootstrap', { cache: 'no-store' });
    const payload = await decodeResponse(response);
    token = payload.token;
    state = payload.state;
    qs('#server-status').textContent = 'Local API 已連線';
    qs('#server-status').className = 'gu-status gu-status-success';
    renderState();
    log('Guided Update 已連線', 'success');
  } catch (error) {
    qs('#server-status').textContent = '連線失敗';
    qs('#server-status').className = 'gu-status gu-status-danger';
    showMessage('error', error.message);
    log('啟動失敗：' + error.message, 'error');
  } finally {
    setBusy(false);
  }
}

bootstrap();
