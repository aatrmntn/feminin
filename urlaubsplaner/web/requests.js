// "Anträge" (approvers only): everything waiting for a decision, with staffing warnings.
// The API checks the approver group itself; this page only shows what it returns.
import { api, days, h, kindText, longDate, rangeText, showToast } from './ui.js';

export function requestsPage({ onDecided }) {
  const section = h('section', { class: 'requests' },
    h('h1', {}, 'Offene Anträge'),
    h('p', { class: 'loading' }, 'Wird geladen …'));
  load(section, onDecided);
  return section;
}

async function load(section, onDecided) {
  let data;
  try {
    data = await api('GET', '/api/requests');
  } catch (err) {
    if (err.status !== 401) section.replaceChildren(h('h1', {}, 'Offene Anträge'), h('p', { class: 'error', role: 'alert' }, err.message));
    return;
  }
  if (!data) return;
  const list = data.requests;
  section.replaceChildren(
    h('h1', {}, 'Offene Anträge'),
    list.length
      ? h('ul', { class: 'request-list' }, list.map((r) => h('li', {}, card(r, data.reasons, onDecided))))
      : h('p', { class: 'hint card' }, 'Keine offenen Anträge. Alles erledigt.'),
  );
}

function card(r, reasons, onDecided) {
  const commentId = `c-${r.id}`;
  const comment = h('textarea', { id: commentId, rows: '2', maxlength: '300' });
  const error = h('p', { class: 'error', role: 'alert' });
  const buttons = [];

  async function decide(status) {
    error.textContent = '';
    for (const b of buttons) b.disabled = true;
    try {
      await api('POST', `/api/entries/${r.id}/decision`, { status, comment: comment.value, expectedRev: r.rev });
      showToast(status === 'approved' ? `Antrag von ${r.name} bestätigt.` : `Antrag von ${r.name} abgelehnt.`);
      onDecided();
    } catch (err) {
      error.textContent = err.message;
      for (const b of buttons) b.disabled = false;
    }
  }

  const article = h('article', { class: `card request k-${r.kind}` },
    h('header', { class: 'request-head' },
      h('h2', {}, r.name),
      h('span', { class: 'hint' }, r.roleLabel)),
    h('p', { class: 'request-what' },
      h('strong', {}, rangeText(r)),
      h('span', {}, ` · ${kindText(r, reasons)}${r.kind === 'vacation' ? ` · ${days(r.days)}` : ''}`)),
    r.note ? h('p', { class: 'entry-note' }, `Notiz: ${r.note}`) : null,
    h('p', { class: 'hint' }, `Beantragt am ${longDate(r.createdAt.slice(0, 10))}`),
    r.warningText ? h('p', { class: 'notice warning' }, `Achtung: ${r.warningText}`) : null);

  if (r.isOwn) {
    article.append(h('p', { class: 'hint' }, 'Deinen eigenen Antrag bestätigt die andere Person aus der Praxisleitung.'));
    return article;
  }
  buttons.push(
    h('button', { class: 'button primary', type: 'button', onclick: () => decide('approved') }, 'Bestätigen'),
    h('button', { class: 'button danger', type: 'button', onclick: () => decide('declined') }, 'Ablehnen'),
  );
  article.append(
    h('div', { class: 'field' },
      h('label', { for: commentId }, 'Kommentar ', h('span', { class: 'hint' }, '(freiwillig, sieht die Person)')),
      comment),
    error,
    h('div', { class: 'actions' }, buttons));
  return article;
}
