/* feminin · Frag KI über uns. No requests until a visitor follows a provider link. */
(() => {
  'use strict';
  const script = document.currentScript;
  const host = document.createElement('feminin-frag-ki');
  const target = script?.dataset.target && document.getElementById(script.dataset.target);
  if (target) target.append(host); else script?.after(host);
  const root = host.attachShadow({mode: 'open'});
  // Only public feminin URLs are passed on. Never include query strings or fragments.
  let source = 'https://feminin.at/';
  try {
    const candidate = new URL(script?.dataset.source || document.querySelector('link[rel="canonical"]')?.href || location.href);
    if (candidate.protocol === 'https:' && ['feminin.at', 'www.feminin.at'].includes(candidate.hostname)) {
      source = candidate.origin + candidate.pathname;
    }
  } catch { /* retain the public home page */ }
  const questions = [
    ['Über feminin', 'Was ist feminin in Wien-Döbling, an wen richtet sich das Zentrum und welche Fachbereiche gibt es?'],
    ['Leistungen & Team', 'Welche Leistungen bietet feminin für Frau, Mutter und Kind an, und welche Ärzt:innen und Therapeut:innen gehören zum Team?'],
    ['Termin vereinbaren', 'Wie kann ich bei feminin einen Termin vereinbaren und wo finde ich die aktuellen Kontaktdaten, die Adresse und die Ordinationszeiten?'],
    ['Kasse & Kosten', 'Welche Informationen veröffentlicht feminin zu Kassen- und Wahlleistungen, Kosten und Kostenerstattung? Nenne nur ausdrücklich veröffentlichte Angaben.']
  ];
  root.innerHTML = `
    <style>
      :host{display:block;color:#4b2a1d;font:16px/1.6 "Segoe UI",Arial,sans-serif;text-align:left;color-scheme:light;--rust:#76351f;--line:#dfcfc3}
      *{box-sizing:border-box} [hidden]{display:none!important}
      .wrap{background:#f6efe9;border:1px solid var(--line);padding:clamp(24px,5vw,56px);position:relative;overflow:hidden}
      .top{display:flex;justify-content:space-between;align-items:start;gap:24px}.symbol{font:64px/1 Georgia,serif;color:#93604a;flex:none}
      h2{font:400 clamp(30px,4vw,44px)/1.15 Optima,Candara,Georgia,serif;color:var(--rust);margin:0 0 16px;letter-spacing:-.8px}
      p{margin:0 0 24px;max-width:610px}.intro{color:#684838;font-size:17px}
      label{display:block;font-size:13px;font-weight:600;margin:0 0 8px}
      select{width:100%;padding:14px 40px 14px 16px;font:inherit;color:#4b2a1d;background:#fff;border:1px solid #ac8b78;border-radius:0;min-height:52px}
      .question{font:400 clamp(19px,2.6vw,23px)/1.4 Optima,Candara,Georgia,serif;margin:23px 0 21px;color:var(--rust)}
      .providers{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
      a,button{font:inherit} .provider{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;min-height:54px;border:1px solid #946c56;text-decoration:none;color:var(--rust);background:transparent;cursor:pointer;font-size:15px;font-weight:600}
      .provider:first-child{background:var(--rust);color:white;border-color:var(--rust)}
      .provider:hover{background:#eee2d8;color:#4b2a1d}.provider:first-child:hover{background:#582716;color:white}
      .arrow{font-size:19px;font-weight:400}.note{font-size:12px;color:#715344;margin:15px 0 0;max-width:none}
      details{border-top:1px solid var(--line);margin-top:26px;padding-top:16px;font-size:13px}
      summary{cursor:pointer;min-height:28px;color:var(--rust)}
      .prompt{white-space:pre-wrap;background:#fff;padding:18px;margin:12px 0;font:13px/1.7 "Segoe UI",Arial,sans-serif;color:#4b2a1d;overflow-wrap:anywhere}
      .text-button{padding:9px 14px;border:1px solid #946c56;background:#fff;color:var(--rust);cursor:pointer;min-height:44px}
      .transfer{background:#fff;margin-top:20px;padding:22px;border-left:3px solid var(--rust)}
      .transfer h3{font-size:17px;color:var(--rust);margin:0 0 7px}.transfer p{font-size:14px;margin:0 0 12px}
      textarea{width:100%;height:160px;resize:vertical;font:13px/1.6 "Segoe UI",Arial,sans-serif;padding:12px;border:1px solid var(--line);color:#4b2a1d;background:#fff}
      .actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:12px}.actions a{display:inline-flex;align-items:center;text-decoration:none}
      .status{font-size:13px;margin:10px 0 0;min-height:21px}
      :focus-visible{outline:3px solid #2c666c;outline-offset:4px}
      @media(max-width:650px){.providers{grid-template-columns:1fr 1fr}.symbol{display:none}.wrap{padding:26px 22px}h2{font-size:32px}.intro{font-size:16px}}
      @media(max-width:330px){.providers{grid-template-columns:1fr}}
    </style>
    <section class="wrap" aria-labelledby="fki-title">
      <div class="top"><div><h2 id="fki-title">Fragen zu feminin?<br>Fragen Sie Ihre KI.</h2>
      <p class="intro">Lassen Sie sich unser Zentrum, unsere Leistungen und den Weg zu Ihrem Termin erklären – mit dem KI-Dienst Ihrer Wahl.</p></div><svg class="symbol" aria-hidden="true" width="54" height="54" viewBox="0 0 54 54"><g fill="none" stroke="currentColor" stroke-width="1.4"><path d="M27 1v52M1 27h52M9 9l36 36M9 45L45 9"/><circle cx="27" cy="27" r="17"/></g></svg></div>
      <label for="fki-topic">Was möchten Sie über uns wissen?</label>
      <select id="fki-topic">${questions.map(([label], i) => `<option value="${i}">${label}</option>`).join('')}</select>
      <p class="question" id="fki-question"></p>
      <div class="providers" aria-label="KI-Dienst auswählen">
        <a class="provider" data-provider="chatgpt" target="_blank" rel="noopener noreferrer" aria-label="Frage in ChatGPT öffnen, neuer Tab">ChatGPT <svg class="arrow" aria-hidden="true" width="15" height="15" viewBox="0 0 16 16"><path d="M3 13L13 3M3 3h10v10" fill="none" stroke="currentColor" stroke-width="1.3"/></svg></a>
        <a class="provider" data-provider="claude" target="_blank" rel="noopener noreferrer" aria-label="Frage in Claude öffnen, neuer Tab">Claude <svg class="arrow" aria-hidden="true" width="15" height="15" viewBox="0 0 16 16"><path d="M3 13L13 3M3 3h10v10" fill="none" stroke="currentColor" stroke-width="1.3"/></svg></a>
        <a class="provider" data-provider="perplexity" target="_blank" rel="noopener noreferrer" aria-label="Frage in Perplexity öffnen, neuer Tab">Perplexity <svg class="arrow" aria-hidden="true" width="15" height="15" viewBox="0 0 16 16"><path d="M3 13L13 3M3 3h10v10" fill="none" stroke="currentColor" stroke-width="1.3"/></svg></a>
        <button class="provider" data-provider="gemini" aria-expanded="false" aria-controls="fki-transfer">Gemini <svg class="arrow" aria-hidden="true" width="15" height="15" viewBox="0 0 16 16"><path d="M3 13L13 3M3 3h10v10" fill="none" stroke="currentColor" stroke-width="1.3"/></svg></button>
      </div>
      <p class="note">Externe Dienste · Ein Konto kann erforderlich sein. Bei Gemini kopieren Sie die Frage und fügen sie dort ein.</p>
      <div class="transfer" id="fki-transfer" hidden>
        <h3>Ihre Frage für Gemini</h3><p>Kopieren Sie den Text und fügen Sie ihn in Gemini ein.</p>
        <textarea readonly aria-label="Vorbereitete Frage zum Kopieren"></textarea>
        <div class="actions"><button class="text-button" data-copy>Frage kopieren</button><a class="text-button" href="https://gemini.google.com/app" target="_blank" rel="noopener noreferrer">Gemini öffnen ↗</a><button class="text-button" data-close>Schließen</button></div>
      </div>
      <details><summary>Welche Frage wird übergeben?</summary><div class="prompt"></div><button class="text-button" data-copy>Frage kopieren</button></details>
      <p class="status" role="status" aria-live="polite"></p>
      <p class="note">Die Frage und der öffentliche Seitenlink werden beim Öffnen an den gewählten Dienst übergeben. Bitte geben Sie dort keine persönlichen Gesundheitsdaten ein. KI-Antworten können Fehler enthalten und ersetzen keine ärztliche Beratung. Verbindliche Informationen erhalten Sie direkt bei feminin.</p>
    </section>`;
  const select = root.querySelector('select');
  const status = root.querySelector('.status');
  let prompt = '';
  function update() {
    const question = questions[Number(select.value)][1];
    prompt = `Bitte informiere mich auf Deutsch über feminin, das Ärzt:innen- und Gesundheitszentrum für Frau, Mutter und Kind in Wien-Döbling.\n\nNutze die öffentliche Website https://feminin.at/ und diese Seite als Ausgangspunkt: ${source}\n\nMeine Frage: ${question}\n\nLies nach Möglichkeit die aktuellen Originalseiten und verlinke deine Quellen. Wenn du die Website nicht aufrufen kannst oder eine Information fehlt, sage das ausdrücklich. Erfinde keine Leistungen, Teammitglieder, Preise, freien Termine oder Angaben zur Kostenerstattung. Gib keine individuelle medizinische Beratung. Nenne am Ende den offiziellen Kontakt- oder Terminweg auf feminin.at.`;
    root.querySelector('#fki-question').textContent = question;
    root.querySelector('.prompt').textContent = prompt;
    root.querySelector('textarea').value = prompt;
    const q = encodeURIComponent(prompt);
    root.querySelector('[data-provider="chatgpt"]').href = `https://chatgpt.com/?q=${q}`;
    root.querySelector('[data-provider="claude"]').href = `https://claude.ai/new?q=${q}`;
    root.querySelector('[data-provider="perplexity"]').href = `https://www.perplexity.ai/search?q=${q}`;
    status.textContent = '';
  }
  const gemini = root.querySelector('[data-provider="gemini"]');
  const transfer = root.querySelector('.transfer');
  gemini.addEventListener('click', () => {
    transfer.hidden = !transfer.hidden;
    gemini.setAttribute('aria-expanded', String(!transfer.hidden));
    if (!transfer.hidden) root.querySelector('textarea').focus();
  });
  root.querySelector('[data-close]').addEventListener('click', () => {
    transfer.hidden = true; gemini.setAttribute('aria-expanded', 'false'); gemini.focus();
  });
  root.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      status.textContent = 'Frage kopiert. Sie können sie in Ihrem KI-Dienst einfügen.';
    } catch {
      transfer.hidden = false; gemini.setAttribute('aria-expanded', 'true');
      const field = root.querySelector('textarea'); field.focus(); field.select();
      status.textContent = 'Automatisches Kopieren nicht möglich. Bitte kopieren Sie den markierten Text.';
    }
  }));
  select.addEventListener('change', update);
  update();
})();
