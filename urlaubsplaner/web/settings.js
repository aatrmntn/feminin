// "Einstellungen" (approvers only): people, practice closures and practice settings.
// The API checks the approver group itself; this page only shows what it returns.
import {
  WD_KEYS, WEEKDAYS, api, closureNotice, h, num, printNotice, rangeText, showToast,
} from './ui.js';

const dialog = document.getElementById('extra-dialog');
const view = { year: null };

export function settingsPage({ today, myId, practiceName, onChanged }) {
  if (!view.year) view.year = Number(today.slice(0, 4));
  const section = h('section', { class: 'settings' }, h('h1', {}, 'Einstellungen'), h('p', { class: 'loading' }, 'Wird geladen …'));
  const ctx = { section, today, myId, practiceName, onChanged };
  load(ctx);
  return section;
}

async function load(ctx) {
  let people;
  let settings;
  let overview;
  try {
    [people, settings, overview] = await Promise.all([
      api('GET', `/api/people?year=${view.year}`),
      api('GET', '/api/settings'),
      api('GET', `/api/overview?year=${view.year}`),
    ]);
  } catch (err) {
    if (err.status !== 401) ctx.section.replaceChildren(h('h1', {}, 'Einstellungen'), h('p', { class: 'error', role: 'alert' }, err.message));
    return;
  }
  if (!people || !settings || !overview) return;
  const reload = () => { load(ctx); ctx.onChanged?.(); };
  const step = (delta) => () => { view.year += delta; load(ctx); };

  ctx.section.replaceChildren(
    h('div', { class: 'toolbar' },
      h('h1', {}, 'Einstellungen'),
      h('div', { class: 'pager' },
        h('button', { class: 'button icon', type: 'button', 'aria-label': 'Jahr davor', onclick: step(-1), disabled: view.year <= 2020 }, '‹'),
        h('h2', { class: 'pager-label', 'aria-live': 'polite' }, String(view.year)),
        h('button', { class: 'button icon', type: 'button', 'aria-label': 'Nächstes Jahr', onclick: step(1), disabled: view.year >= 2040 }, '›'))),
    peopleSection(people, ctx, reload),
    closuresSection(overview.closures, ctx, reload),
    practiceSection(settings, reload),
  );
}

// ---------- helpers ----------

function openDialog(title, ...content) {
  dialog.replaceChildren(h('div', { class: 'dialog-body' }, h('h2', { id: 'extra-title' }, title), ...content));
  dialog.showModal();
  dialog.querySelector('input, select, textarea, button')?.focus();
}

function weekdayBoxes(name, selected) {
  return h('fieldset', { class: 'choices weekdays-pick' }, h('legend', {}, 'Arbeitstage'),
    WD_KEYS.map((k, i) => h('label', { class: 'choice' },
      h('input', { type: 'checkbox', name, value: k, checked: selected.includes(k) }),
      h('span', {}, WEEKDAYS[i].slice(0, 2)))));
}

function checked(form, name) {
  return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
}

function field(id, label, input, hint) {
  return h('div', { class: 'field' }, h('label', { for: id }, label, hint ? h('span', { class: 'hint' }, ` ${hint}`) : null), input);
}

function checkbox(id, label, isChecked, hint) {
  return h('label', { class: 'check', for: id },
    h('input', { type: 'checkbox', id, checked: isChecked }),
    h('span', {}, label, hint ? h('span', { class: 'hint' }, ` ${hint}`) : null));
}

function numberInput(id, value, placeholder) {
  return h('input', {
    id, type: 'number', min: '0', max: '60', step: '0.5', inputmode: 'decimal', value: value ?? '', placeholder,
  });
}

function formActions(error, saveLabel = 'Speichern') {
  return [
    error,
    h('div', { class: 'actions' },
      h('button', { class: 'button primary', type: 'submit' }, saveLabel),
      h('button', { class: 'button', type: 'button', onclick: () => dialog.close() }, 'Abbrechen')),
  ];
}

const days = (n) => `${num(n)} ${n === 1 ? 'Tag' : 'Tage'}`;
const pattern = (keys) => keys.map((k) => WEEKDAYS[WD_KEYS.indexOf(k)].slice(0, 2)).join(', ');

// ---------- people ----------

function peopleSection(data, ctx, reload) {
  const rows = data.people.map((p) => h('tr', { class: p.active ? '' : 'inactive' },
    h('th', { scope: 'row' }, p.name, p.active ? null : h('span', { class: 'badge declined' }, 'deaktiviert'),
      p.approver ? h('span', { class: 'badge approved' }, 'darf genehmigen') : null),
    h('td', {}, p.roleLabel),
    h('td', {}, pattern(p.workPattern)),
    h('td', {}, num(p.allowanceOverride ?? p.defaultAllowance), p.allowanceOverride == null ? h('span', { class: 'hint' }, ' (auto)') : null),
    h('td', {}, num(p.carryOver), p.balance.carryOverExpired ? h('span', { class: 'hint' }, ` (${num(p.balance.carryOverExpired)} verfallen)`) : null),
    h('td', {}, num(p.balance.remaining), p.balance.pending ? h('span', { class: 'hint' }, ` (${num(p.balance.pending)} beantragt)`) : null),
    h('td', {}, h('button', { class: 'link', type: 'button', onclick: () => editPerson(p, data, ctx, reload), 'aria-label': `${p.name} bearbeiten` }, 'Bearbeiten'))));

  return h('section', { class: 'card' },
    h('div', { class: 'section-head' },
      h('h2', {}, 'Team'),
      h('button', { class: 'button primary', type: 'button', onclick: () => addPerson(data, reload) }, '+ Person hinzufügen')),
    h('div', { class: 'table-wrap', role: 'region', tabindex: '0', 'aria-label': 'Team, seitlich scrollbar' },
      h('table', { class: 'people' },
        h('thead', {}, h('tr', {},
          h('th', { scope: 'col' }, 'Name'), h('th', { scope: 'col' }, 'Bereich'), h('th', { scope: 'col' }, 'Arbeitstage'),
          h('th', { scope: 'col' }, `Anspruch ${data.year}`), h('th', { scope: 'col' }, 'Resttage'),
          h('th', { scope: 'col' }, 'Übrig'), h('th', { scope: 'col' }, h('span', { class: 'sr-only' }, 'Aktionen')))),
        h('tbody', {}, rows))));
}

function roleSelect(id, roles, value) {
  return h('select', { id }, Object.entries(roles).map(([k, v]) => h('option', { value: k, selected: k === value }, v)));
}

function editPerson(p, data, ctx, reload) {
  const self = p.userId === ctx.myId;
  const error = h('p', { class: 'error', role: 'alert' });
  const name = h('input', { id: 'p-name', maxlength: '80', value: p.name });
  const role = roleSelect('p-role', data.roles, p.role);
  const allowance = numberInput('p-allowance', p.allowanceOverride, `automatisch: ${num(p.defaultAllowance)}`);
  const carry = numberInput('p-carry', p.carryOver || '', '0');
  const form = h('form', { class: 'dialog-form', novalidate: true },
    field('p-name', 'Name', name),
    field('p-role', 'Bereich', role),
    weekdayBoxes('p-days', p.workPattern),
    field('p-allowance', `Urlaubsanspruch ${data.year}`, allowance, '(leer lassen = automatisch nach Arbeitstagen)'),
    field('p-carry', `Resttage aus ${data.year - 1}`, carry, `(verfallen am 31. März ${data.year})`),
    p.suggestedCarryOver == null ? null : h('button', {
      class: 'link', type: 'button',
      onclick: () => { carry.value = String(p.suggestedCarryOver); },
    }, `Vorschlag übernehmen: ${days(p.suggestedCarryOver)} waren Ende ${data.year - 1} übrig`),
    checkbox('p-approver', 'Darf Urlaub genehmigen', p.approver),
    checkbox('p-active', 'Aktiv', p.active, '(deaktiviert = kann sich nicht mehr anmelden, Daten bleiben)'),
    ...formActions(error));
  if (self) {
    form.querySelector('#p-active').disabled = true;
    form.querySelector('#p-approver').disabled = true;
  }
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    error.textContent = '';
    const body = {
      name: name.value,
      role: role.value,
      workPattern: checked(form, 'p-days'),
      year: data.year,
      allowance: allowance.value === '' ? null : Number(allowance.value),
      carryOver: carry.value === '' ? 0 : Number(carry.value),
    };
    if (!self) {
      body.active = form.querySelector('#p-active').checked;
      body.approver = form.querySelector('#p-approver').checked;
    }
    try {
      await api('PUT', `/api/people/${encodeURIComponent(p.userId)}`, body);
      dialog.close();
      showToast(`${body.name} gespeichert.`);
      reload();
    } catch (err) {
      error.textContent = err.message;
    }
  });
  openDialog(`${p.name} bearbeiten`, form);
}

function addPerson(data, reload) {
  const error = h('p', { class: 'error', role: 'alert' });
  const username = h('input', { id: 'n-user', maxlength: '40', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false' });
  const name = h('input', { id: 'n-name', maxlength: '80', autocomplete: 'off' });
  const role = roleSelect('n-role', data.roles, 'frontoffice');
  const email = h('input', { id: 'n-email', type: 'email', autocomplete: 'off' });
  const form = h('form', { class: 'dialog-form', novalidate: true },
    field('n-name', 'Name', name, '(so sehen ihn die Kolleg:innen)'),
    field('n-user', 'Benutzername', username, '(zum Anmelden, z. B. der Nachname, klein geschrieben)'),
    field('n-role', 'Bereich', role),
    weekdayBoxes('n-days', ['mon', 'tue', 'wed', 'thu', 'fri']),
    field('n-email', 'Eigene E-Mail-Adresse', email, '(freiwillig, keine gemeinsame Adresse wie office@)'),
    checkbox('n-approver', 'Darf Urlaub genehmigen', false),
    ...formActions(error, 'Zugang anlegen'));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    error.textContent = '';
    try {
      const res = await api('POST', '/api/people', {
        username: username.value,
        name: name.value,
        role: role.value,
        workPattern: checked(form, 'n-days'),
        email: email.value,
        approver: form.querySelector('#n-approver').checked,
      });
      showPassword(res.person, res.startPassword);
      reload();
    } catch (err) {
      error.textContent = err.message;
    }
  });
  openDialog('Person hinzufügen', form);
}

function showPassword(person, password) {
  openDialog('Zugang angelegt',
    h('p', {}, `Gib ${person.name} diese Daten persönlich. Das Start-Passwort siehst du nur jetzt.`),
    h('dl', { class: 'credentials' },
      h('dt', {}, 'Benutzername'), h('dd', {}, h('code', {}, person.username)),
      h('dt', {}, 'Start-Passwort'), h('dd', {}, h('code', {}, password))),
    h('p', { class: 'hint' }, 'Das Start-Passwort gilt 7 Tage. Beim ersten Anmelden wählt die Person ein eigenes Passwort und verbindet eine Authenticator-App am Handy.'),
    h('div', { class: 'actions' }, h('button', { class: 'button primary', type: 'button', onclick: () => dialog.close() }, 'Fertig')));
}

// ---------- closures ----------

function closuresSection(closures, ctx, reload) {
  return h('section', { class: 'card' },
    h('div', { class: 'section-head' },
      h('h2', {}, `Betriebsurlaub ${view.year}`),
      h('button', { class: 'button primary', type: 'button', onclick: () => editClosure(null, reload) }, '+ Betriebsurlaub eintragen')),
    h('p', { class: 'hint' }, 'An diesen Tagen ist die ganze Ordination geschlossen. Niemand muss dafür Urlaub beantragen.'),
    closures.length
      ? h('ul', { class: 'plain closure-list' }, closures.map((c) => h('li', {},
        h('div', {},
          h('strong', {}, rangeText(c)),
          c.label ? h('span', {}, ` · ${c.label}`) : null,
          h('span', { class: 'hint' }, c.countsAsVacation ? ' · zählt als Urlaub' : ' · zählt nicht als Urlaub'),
          c.substitute ? h('div', { class: 'hint' }, `Vertretung: ${c.substitute}`) : null),
        h('div', { class: 'actions' },
          h('button', { class: 'button small', type: 'button', onclick: () => printNotice(closureNotice(c, ctx.practiceName)) }, 'Aushang drucken'),
          h('button', { class: 'button small', type: 'button', onclick: () => editClosure(c, reload) }, 'Bearbeiten'),
          h('button', {
            class: 'button small danger', type: 'button',
            onclick: async () => {
              if (!window.confirm(`Betriebsurlaub ${rangeText(c)} löschen?`)) return;
              try {
                await api('DELETE', `/api/closures/${c.id}?rev=${c.rev}`);
                showToast('Gelöscht.');
                reload();
              } catch (err) {
                showToast(err.message);
              }
            },
          }, 'Löschen')))))
      : h('p', {}, 'Noch kein Betriebsurlaub eingetragen.'));
}

function editClosure(c, reload) {
  const error = h('p', { class: 'error', role: 'alert' });
  const start = h('input', { id: 'c-start', type: 'date', min: '2020-01-01', max: '2040-12-31', value: c?.start || `${view.year}-12-24` });
  const end = h('input', { id: 'c-end', type: 'date', min: '2020-01-01', max: '2040-12-31', value: c?.end || `${view.year + 1}-01-06` });
  const label = h('input', { id: 'c-label', maxlength: '80', value: c?.label || '', placeholder: 'z. B. Weihnachten' });
  const substitute = h('input', { id: 'c-sub', maxlength: '300', value: c?.substitute || '', placeholder: 'Name, Adresse, Telefon' });
  const form = h('form', { class: 'dialog-form', novalidate: true },
    h('div', { class: 'row' }, field('c-start', 'Von', start), field('c-end', 'Bis', end)),
    field('c-label', 'Bezeichnung', label),
    checkbox('c-counts', 'Zählt als Urlaub', c ? c.countsAsVacation : true, '(wird allen an ihren Arbeitstagen vom Urlaub abgezogen)'),
    field('c-sub', 'Vertretung', substitute, '(steht auf dem Aushang)'),
    ...formActions(error));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    error.textContent = '';
    const body = {
      start: start.value, end: end.value, label: label.value, substitute: substitute.value,
      countsAsVacation: form.querySelector('#c-counts').checked,
    };
    try {
      if (c) await api('PUT', `/api/closures/${c.id}`, { ...body, expectedRev: c.rev });
      else await api('POST', '/api/closures', body);
      dialog.close();
      showToast('Betriebsurlaub gespeichert.');
      reload();
    } catch (err) {
      error.textContent = err.message;
    }
  });
  openDialog(c ? 'Betriebsurlaub bearbeiten' : 'Betriebsurlaub eintragen', form);
}

// ---------- practice ----------

function practiceSection(s, reload) {
  const error = h('p', { class: 'error', role: 'alert' });
  const name = h('input', { id: 's-name', maxlength: '80', value: s.practiceName });
  const allowance = numberInput('s-allowance', s.defaultAllowance);
  const minimum = Object.entries(s.roles).map(([k, v]) => field(`s-min-${k}`, v,
    h('input', { id: `s-min-${k}`, type: 'number', min: '0', max: '20', step: '1', inputmode: 'numeric', value: s.minimumStaffing[k] ?? 0 })));
  const form = h('form', { class: 'practice-form', novalidate: true },
    field('s-name', 'Name der Ordination', name, '(steht auf dem Aushang)'),
    h('fieldset', { class: 'choices weekdays-pick' }, h('legend', {}, 'Öffnungstage'),
      WD_KEYS.map((k, i) => h('label', { class: 'choice' },
        h('input', { type: 'checkbox', name: 's-open', value: k, checked: s.openDays.includes(k) }),
        h('span', {}, WEEKDAYS[i].slice(0, 2))))),
    h('fieldset', {}, h('legend', {}, 'Mindestbesetzung pro Öffnungstag'),
      h('p', { class: 'hint' }, '0 heißt: keine Warnung für diesen Bereich.'),
      h('div', { class: 'row three' }, minimum)),
    field('s-allowance', 'Urlaubsanspruch bei 5 Arbeitstagen', allowance, '(Teilzeit wird automatisch umgerechnet)'),
    checkbox('s-approve', 'Fortbildung, Kongress & Co. müssen bestätigt werden', s.absenceNeedsApproval),
    error,
    h('div', { class: 'actions' }, h('button', { class: 'button primary', type: 'submit' }, 'Speichern')));
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    error.textContent = '';
    const minimumStaffing = {};
    for (const k of Object.keys(s.roles)) minimumStaffing[k] = Number(form.querySelector(`#s-min-${k}`).value || 0);
    try {
      await api('PUT', '/api/settings', {
        practiceName: name.value,
        openDays: checked(form, 's-open'),
        minimumStaffing,
        defaultAllowance: Number(allowance.value),
        absenceNeedsApproval: form.querySelector('#s-approve').checked,
      });
      showToast('Einstellungen gespeichert.');
      reload();
    } catch (err) {
      error.textContent = err.message;
    }
  });
  return h('section', { class: 'card' }, h('h2', {}, 'Ordination'), form);
}
