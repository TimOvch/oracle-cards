'use strict';

const $ = id => document.getElementById(id);
const STORAGE_KEY = 'oracle-study-cards:semester07-block01:v2';
const TOPICS = {
  architecture: 'Архитектура',
  storage: 'Хранение данных',
  installation: 'Установка',
  creation: 'Создание БД',
  instance: 'Экземпляр',
  'instance-management': 'Управление экземпляром',
  administration: 'Администрирование',
  security: 'Безопасность',
};
const LOCATORS = {
  thematic_range_approx_30s: 'тематический диапазон · ±30 с',
  slide_only_no_spoken_locator: 'только слайд · устный фрагмент не найден',
  not_available: 'точный локатор не подтверждён',
};
const IMPORTANCE_STATUS = {
  agreed_by_both_asr_not_manually_listened: 'обнаружено обеими ASR-моделями; вручную не прослушано',
  manually_verified: 'проверено по записи вручную',
  not_detected: 'явный маркер не обнаружен',
};

let cards = [];
let visible = [];
let cursor = 0;
let revealed = false;
let shuffled = false;
let progress = loadProgress();

function loadProgress() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return value && typeof value === 'object' && value.cards && typeof value.cards === 'object'
      ? value
      : { version: 1, cards: {} };
  } catch {
    return { version: 1, cards: {} };
  }
}

function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    $('storage-note').textContent = 'Прогресс сохранён только в этом браузере. Текст карточек не изменяется.';
  } catch {
    $('storage-note').textContent = 'Браузер запретил сохранение: оценки исчезнут после закрытия страницы.';
  }
}

function list(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
}

function importance(card) {
  const marker = card.teacher_evidence?.explicit_importance_marker;
  return marker === true || Boolean(marker && typeof marker === 'object' && marker.present);
}

function layers(card) {
  const source = card.answer_layers || {};
  return {
    defense: source.default_defense_answer || card.answer_short || '',
    teacher: source.teacher_default || card.answer_short || '',
    additions: list(source.documentation_addition || card.teacher_evidence?.documentation_clarification),
    corrections: list(source.documentation_correction),
  };
}

function hasConflict(card) {
  return layers(card).corrections.length > 0 || String(card.status || '').includes('conflict');
}

function hasDocumentation(card) {
  return layers(card).additions.length > 0;
}

function topicLabel(topic) {
  return TOPICS[topic] || topic.replaceAll('-', ' ');
}

function escapeText(value) {
  return String(value ?? '');
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

function currentCard() {
  return visible[cursor] || null;
}

function matchesSource(card, filter) {
  const state = progress.cards[card.id]?.status;
  if (filter === 'important') return importance(card);
  if (filter === 'conflict') return hasConflict(card);
  if (filter === 'documentation') return hasDocumentation(card);
  if (filter === 'review') return state === 'review';
  if (filter === 'unseen') return !state;
  return true;
}

function rebuildVisible({ preserveId = true } = {}) {
  const previousId = preserveId ? currentCard()?.id : null;
  const topic = $('topic-filter').value;
  const source = $('source-filter').value;
  visible = cards.filter(card => (topic === 'all' || card.topic === topic) && matchesSource(card, source));
  if (shuffled) visible = shuffle(visible);
  const previousIndex = previousId ? visible.findIndex(card => card.id === previousId) : -1;
  cursor = previousIndex >= 0 ? previousIndex : 0;
  revealed = false;
  render();
}

function setText(id, value) {
  $(id).textContent = escapeText(value);
}

function fillList(id, items, renderItem) {
  const root = $(id);
  root.replaceChildren();
  for (const item of items) {
    const li = document.createElement('li');
    renderItem(li, item);
    root.append(li);
  }
}

function badge(text, className = '') {
  const span = document.createElement('span');
  span.className = `badge ${className}`.trim();
  span.textContent = text;
  return span;
}

function locatorText(evidence) {
  if (!evidence) return '';
  const parts = [];
  if (evidence.recording) parts.push(evidence.recording.replace('s07-lecture', 'лекция '));
  if (evidence.time_range) parts.push(evidence.time_range);
  return parts.join(' · ');
}

function renderBadges(card) {
  const root = $('card-badges');
  root.replaceChildren(badge(topicLabel(card.topic)));
  if (importance(card)) root.append(badge('важно по лекции', 'important'));
  if (hasConflict(card)) root.append(badge('есть исправление', 'correction'));
  const state = progress.cards[card.id]?.status;
  if (state === 'known') root.append(badge('знаю', 'status-known'));
  if (state === 'review') root.append(badge('повторить', 'status-review'));
}

function renderAnswer(card) {
  const answer = layers(card);
  setText('defense-text', answer.defense);
  setText('deep-text', card.answer_deep || '');
  $('deep-section').hidden = !card.answer_deep || card.answer_deep === answer.defense;

  const evidence = card.teacher_evidence;
  const showTeacher = Boolean(answer.teacher || evidence?.text);
  $('teacher-section').hidden = !showTeacher;
  setText('teacher-default', answer.teacher);
  setText('teacher-excerpt', evidence?.text || 'Для этой карточки обработанный фрагмент пока не привязан.');
  setText('teacher-locator', locatorText(evidence));
  setText('locator-note', evidence
    ? `${LOCATORS[evidence.locator_status] || evidence.locator_status || 'статус локатора не указан'}. Пересказ по сведённой транскрипции, не дословная цитата.`
    : 'Фрагмент речи преподавателя пока не привязан.');
  setText('transcript-source', evidence?.source || '');
  $('transcript-source').hidden = !evidence?.source;
  const marker = evidence?.explicit_importance_marker;
  const markerText = marker && typeof marker === 'object' ? marker.text : '';
  const markerStatus = marker && typeof marker === 'object' ? marker.status : '';
  $('importance-note').hidden = !importance(card);
  setText('importance-note', markerText
    ? `Явный акцент преподавателя: ${markerText} (${IMPORTANCE_STATUS[markerStatus] || markerStatus || 'статус не указан'}).`
    : 'В источнике отмечен явный акцент преподавателя; точная формулировка маркера пока не внесена.');
  $('transcript-details').hidden = !evidence?.text;

  $('correction-section').hidden = answer.corrections.length === 0;
  fillList('correction-list', answer.corrections, (li, text) => { li.textContent = text; });
  $('addition-section').hidden = answer.additions.length === 0;
  fillList('addition-list', answer.additions, (li, text) => { li.textContent = text; });

  const terms = list(card.terms);
  $('terms-details').hidden = terms.length === 0;
  const termsRoot = $('terms');
  termsRoot.replaceChildren();
  for (const term of terms) {
    const span = document.createElement('span');
    span.className = 'term';
    span.textContent = term;
    termsRoot.append(span);
  }

  fillList('slides-list', list(card.slides), (li, text) => { li.textContent = text; });
  const docs = list(card.oracle_docs);
  fillList('docs-list', docs, (li, url) => {
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Официальная документация Oracle 11.2';
    li.append(link);
  });
  $('sources-details').hidden = !list(card.slides).length && !docs.length;
}

function renderProgress() {
  const values = cards.map(card => progress.cards[card.id]?.status);
  const known = values.filter(value => value === 'known').length;
  const review = values.filter(value => value === 'review').length;
  const assessed = known + review;
  const percent = cards.length ? Math.round(known / cards.length * 100) : 0;
  setText('progress-label', `${assessed} из ${cards.length} оценено`);
  setText('progress-percent', `${percent}%`);
  setText('known-count', known);
  setText('review-count', review);
  $('progress-bar').style.width = `${percent}%`;
}

function render() {
  renderProgress();
  const card = currentCard();
  const empty = !card;
  $('flashcard').hidden = empty;
  $('deck-meta').hidden = empty;
  $('navigation-row').hidden = empty;
  $('rating-row').hidden = empty || !revealed;
  $('empty-state').hidden = !empty;
  if (empty) return;

  renderBadges(card);
  setText('card-counter', `${cursor + 1} / ${visible.length}`);
  setText('question', card.front);
  $('answer').hidden = !revealed;
  $('reveal').hidden = revealed;
  $('thinking-prompt').hidden = revealed;
  $('flashcard').classList.toggle('is-revealed', revealed);
  $('previous').disabled = visible.length < 2;
  $('next').disabled = visible.length < 2;
  if (revealed) renderAnswer(card);
}

function reveal() {
  if (!currentCard() || revealed) return;
  revealed = true;
  render();
  $('answer').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
}

function move(offset) {
  if (!visible.length) return;
  cursor = (cursor + offset + visible.length) % visible.length;
  revealed = false;
  render();
  $('flashcard').focus({ preventScroll: true });
}

function mark(status) {
  const card = currentCard();
  if (!card || !revealed) return;
  progress.cards[card.id] = { status, updatedAt: new Date().toISOString() };
  saveProgress();
  if (visible.length === 1 && ['review', 'unseen'].includes($('source-filter').value)) {
    rebuildVisible({ preserveId: false });
  } else {
    move(1);
  }
}

function populateTopics() {
  const counts = new Map();
  for (const card of cards) counts.set(card.topic, (counts.get(card.topic) || 0) + 1);
  for (const topic of Object.keys(TOPICS).filter(key => counts.has(key))) {
    const option = document.createElement('option');
    option.value = topic;
    option.textContent = `${topicLabel(topic)} · ${counts.get(topic)}`;
    $('topic-filter').append(option);
  }
}

function bindEvents() {
  $('topic-filter').addEventListener('change', () => rebuildVisible({ preserveId: false }));
  $('source-filter').addEventListener('change', () => rebuildVisible({ preserveId: false }));
  $('shuffle').addEventListener('click', () => {
    shuffled = !shuffled;
    $('shuffle').setAttribute('aria-pressed', String(shuffled));
    $('shuffle').lastChild.textContent = shuffled ? ' Перемешано' : ' Перемешать';
    rebuildVisible({ preserveId: false });
  });
  $('reveal').addEventListener('click', reveal);
  $('flashcard').addEventListener('click', event => {
    if (!event.target.closest('button, a, summary, details')) reveal();
  });
  $('previous').addEventListener('click', () => move(-1));
  $('next').addEventListener('click', () => move(1));
  $('mark-review').addEventListener('click', () => mark('review'));
  $('mark-known').addEventListener('click', () => mark('known'));
  $('clear-filters').addEventListener('click', () => {
    $('topic-filter').value = 'all';
    $('source-filter').value = 'all';
    rebuildVisible({ preserveId: false });
  });
  $('reset-progress').addEventListener('click', () => $('reset-dialog').showModal());
  $('cancel-reset').addEventListener('click', () => $('reset-dialog').close());
  $('confirm-reset').addEventListener('click', () => {
    progress = { version: 1, cards: {} };
    saveProgress();
    $('reset-dialog').close();
    rebuildVisible();
  });
  $('retry').addEventListener('click', load);
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (['SELECT', 'BUTTON', 'A', 'SUMMARY'].includes(document.activeElement?.tagName)) return;
    if (event.code === 'Space') { event.preventDefault(); reveal(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
    if (event.key === '1') mark('review');
    if (event.key === '2') mark('known');
  });
}

async function load() {
  $('startup-error').hidden = true;
  $('study-area').hidden = false;
  $('study-area').setAttribute('aria-busy', 'true');
  try {
    const response = await fetch('cards-data.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.cards) || !data.cards.length) throw new Error('Пустой набор карточек');
    const identifiers = new Set(data.cards.map(card => card.id));
    if (identifiers.size !== data.cards.length) throw new Error('Повторяющиеся идентификаторы карточек');
    cards = data.cards;
    $('topic-filter').replaceChildren(new Option('Все темы', 'all'));
    populateTopics();
    rebuildVisible({ preserveId: false });
  } catch (error) {
    console.error(error);
    $('study-area').hidden = true;
    $('startup-error').hidden = false;
  } finally {
    $('study-area').setAttribute('aria-busy', 'false');
  }
}

bindEvents();
load();
