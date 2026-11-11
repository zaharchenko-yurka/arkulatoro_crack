/*
 * Ceiling contour calculator - browser UI.
 * Requires window.CCCCore. No external libraries, no network calls.
 */
(function () {
  "use strict";

  var core = window.CCCCore;
  if (!core) {
    return;
  }

  var SVG_NS = "http://www.w3.org/2000/svg";
  var STORAGE_PREFIX = "ccc:v1:";

  var TEMPLATE =
    '<div class="ccc-app">' +
    '  <header class="ccc-head">' +
    '    <div>' +
    '      <h2 class="ccc-title" data-ccc-el="title">Калькулятор контуру стелі</h2>' +
    '      <p class="ccc-subtitle">Замір рулеткою → точний контур → файл GLC для Arkulator</p>' +
    '    </div>' +
    '  </header>' +

    '  <details class="ccc-help">' +
    '    <summary>Як міряти — коротка інструкція для замірщика</summary>' +
    '    <div class="ccc-help-body">' +
    '      <div class="ccc-help-text">' +
    '        <ol>' +
    '          <li>Виберіть <b>два сусідні кути кімнати на одній стіні</b>: A і B. Стоячи в кімнаті лицем до стіни, <b>A — ліворуч, B — праворуч</b>. Виміряйте AB по лінії стелі. Чим довша база AB відносно фігури, тим точніше.</li>' +
    '          <li>Маркером поставте точки по контуру вставки та пронумеруйте їх по колу в будь-якому напрямку. На прямих достатньо точок на початку й у кінці; <b>на кожному гострому куті — обов’язково</b>; на кожній дузі — початок, кінець і <b>мінімум одна проміжна</b> (краще 2–3, на складній кривій кожні 20–40 см); на стику прямої та дуги — обов’язково.</li>' +
    '          <li>Для кожної точки виміряйте рулеткою в площині стелі відстань <b>від A</b> і <b>від B</b>. Більше нічого вимірювати не потрібно.</li>' +
    '          <li>Для контролю якості можна додати третій кут C (будь-який кут кімнати поза лінією AB, зазвичай протилежний): виміряйте AC і BC, а для кожної точки — відстань від C.</li>' +
    '          <li>У таблиці позначте <b>«Кут»</b> для гострого зламу контуру та <b>«Пряма →»</b> для прямої ділянки до наступної точки. Хорду заповнюйте за бажанням — це контрольний замір між сусідніми точками.</li>' +
    '        </ol>' +
    '      </div>' +
    '      <div class="ccc-help-figure" aria-hidden="true">' +
    '        <svg viewBox="0 0 320 220" role="presentation">' +
    '          <rect x="20" y="24" width="280" height="170" rx="4" fill="none" stroke="#9db3a5" stroke-width="2"/>' +
    '          <line x1="20" y1="24" x2="300" y2="24" stroke="#b26d00" stroke-width="4"/>' +
    '          <text x="10" y="18" font-size="16" fill="#2f6d4e" font-family="Segoe UI, Tahoma, sans-serif">A</text>' +
    '          <text x="304" y="18" font-size="16" fill="#2f6d4e" font-family="Segoe UI, Tahoma, sans-serif">B</text>' +
    '          <path d="M70 105 C110 55, 205 60, 250 100 C275 125, 240 175, 175 180 C105 185, 55 155, 70 105 Z" fill="#edf7f1" stroke="#2f6d4e" stroke-width="2.5"/>' +
    '          <circle cx="163" cy="120" r="4.5" fill="#2f6d4e"/>' +
    '          <text x="170" y="116" font-size="14" fill="#1f2a24" font-family="Segoe UI, Tahoma, sans-serif">P</text>' +
    '          <line x1="163" y1="120" x2="20" y2="24" stroke="#2f6d4e" stroke-width="1.6" stroke-dasharray="5 4"/>' +
    '          <line x1="163" y1="120" x2="300" y2="24" stroke="#2f6d4e" stroke-width="1.6" stroke-dasharray="5 4"/>' +
    '          <text x="74" y="69" font-size="13" fill="#5e6c63" font-family="Segoe UI, Tahoma, sans-serif">dA</text>' +
    '          <text x="225" y="69" font-size="13" fill="#5e6c63" font-family="Segoe UI, Tahoma, sans-serif">dB</text>' +
    '          <text x="150" y="14" font-size="13" fill="#b26d00" font-family="Segoe UI, Tahoma, sans-serif">стіна AB</text>' +
    '          <text x="112" y="210" font-size="12" fill="#5e6c63" font-family="Segoe UI, Tahoma, sans-serif">кімната — під стіною</text>' +
    '        </svg>' +
    '      </div>' +
    '    </div>' +
    '  </details>' +

    '  <div class="ccc-layout">' +
    '    <section class="ccc-panel ccc-controls" aria-label="Дані замірів">' +
    '      <div class="ccc-grid">' +
    '        <label class="ccc-field ccc-field-wide"><span>Назва об’єкта</span><input type="text" data-ccc-el="objectName" autocomplete="off" placeholder="Наприклад: вітальня, вул. Липова"></label>' +
    '        <label class="ccc-field"><span>Одиниці</span><select data-ccc-el="unit"><option value="mm">мм</option><option value="cm">см</option><option value="m">м</option></select></label>' +
    '        <label class="ccc-field"><span>AB — між кутами A і B</span><input type="text" inputmode="decimal" data-ccc-el="ab" autocomplete="off" placeholder="наприклад 450"></label>' +
    '        <label class="ccc-field"><span>AC (необов’язково)</span><input type="text" inputmode="decimal" data-ccc-el="ac" autocomplete="off" placeholder="для контролю"></label>' +
    '        <label class="ccc-field"><span>BC (необов’язково)</span><input type="text" inputmode="decimal" data-ccc-el="bc" autocomplete="off" placeholder="для контролю"></label>' +
    '        <label class="ccc-field"><span>Похибка заміру σ, мм</span><input type="text" inputmode="decimal" data-ccc-el="sigma" autocomplete="off" value="3"></label>' +
    '        <label class="ccc-field"><span>Допуск спрощення, мм</span><input type="text" inputmode="decimal" data-ccc-el="tol" autocomplete="off" value="3"></label>' +
    '      </div>' +
    '      <div class="ccc-options">' +
    '        <label class="ccc-check"><input type="checkbox" data-ccc-el="extra"><span>Додаткові колонки (C, хорда)</span></label>' +
    '        <label class="ccc-check"><input type="checkbox" data-ccc-el="mirror"><span>Віддзеркалити контур</span></label>' +
    '      </div>' +

    '      <div class="ccc-toolbar" role="group" aria-label="Операції з таблицею">' +
    '        <button type="button" class="ccc-btn ccc-btn-small" data-ccc-action="add-row">+ рядок</button>' +
    '        <button type="button" class="ccc-btn ccc-btn-small" data-ccc-action="add-5">+5</button>' +
    '        <button type="button" class="ccc-btn ccc-btn-small ccc-btn-ghost" data-ccc-action="example">Приклад</button>' +
    '        <button type="button" class="ccc-btn ccc-btn-small ccc-btn-danger" data-ccc-action="clear">Очистити</button>' +
    '        <button type="button" class="ccc-btn ccc-btn-small ccc-btn-ghost" data-ccc-action="import-file">Імпорт CSV</button>' +
    '        <button type="button" class="ccc-btn ccc-btn-small ccc-btn-ghost" data-ccc-action="template">Завантажити шаблон CSV</button>' +
    '        <button type="button" class="ccc-btn ccc-btn-small ccc-btn-ghost" data-ccc-action="save-csv">Зберегти дані CSV</button>' +
    '        <input type="file" class="ccc-file" data-ccc-el="file" accept=".csv,.txt,.tsv,text/csv,text/plain" hidden>' +
    '      </div>' +

    '      <details class="ccc-paste">' +
    '        <summary>Вставити з Excel / CSV</summary>' +
    '        <textarea data-ccc-el="paste" rows="4" placeholder="Вставте скопійовані клітинки або вміст CSV-файлу"></textarea>' +
    '        <div class="ccc-toolbar">' +
    '          <button type="button" class="ccc-btn ccc-btn-small" data-ccc-action="import-text">Імпортувати текст</button>' +
    '          <button type="button" class="ccc-btn ccc-btn-small ccc-btn-ghost" data-ccc-action="clear-paste">Очистити поле</button>' +
    '        </div>' +
    '      </details>' +

    '      <div class="ccc-table-wrap">' +
    '        <table class="ccc-table">' +
    '          <thead><tr>' +
    '            <th scope="col">№</th>' +
    '            <th scope="col">Від A</th>' +
    '            <th scope="col">Від B</th>' +
    '            <th scope="col" data-ccc-col="extra">Від C</th>' +
    '            <th scope="col" class="ccc-th-flag">Кут</th>' +
    '            <th scope="col" class="ccc-th-flag">Пряма →</th>' +
    '            <th scope="col" data-ccc-col="extra">Хорда →</th>' +
    '            <th scope="col" class="ccc-th-status">± мм</th>' +
    '            <th scope="col"><span class="ccc-sr">Дія</span></th>' +
    '          </tr></thead>' +
    '          <tbody data-ccc-el="tbody"></tbody>' +
    '        </table>' +
    '      </div>' +

    '      <div class="ccc-status" data-ccc-el="status" aria-live="polite">Готово до введення замірів.</div>' +
    '      <div class="ccc-messages" data-ccc-el="messages" aria-live="polite"></div>' +
    '    </section>' +

    '    <section class="ccc-panel ccc-preview" aria-label="Перегляд контуру">' +
    '      <div class="ccc-preview-head">' +
    '        <h3>Вигляд зверху</h3>' +
    '        <div class="ccc-preview-actions">' +
    '          <button type="button" class="ccc-btn ccc-btn-small" data-ccc-action="mirror" data-ccc-el="mirrorButton" aria-pressed="false">Віддзеркалити</button>' +
    '          <button type="button" class="ccc-btn ccc-btn-small ccc-btn-ghost" data-ccc-action="fit">Підігнати до екрана</button>' +
    '        </div>' +
    '      </div>' +
    '      <div class="ccc-preview-toggles">' +
    '        <label class="ccc-check"><input type="checkbox" data-ccc-el="showPoints" checked><span>Показувати точки</span></label>' +
    '        <label class="ccc-check"><input type="checkbox" data-ccc-el="showDims"><span>Розміри ребер</span></label>' +
    '      </div>' +
    '      <div class="ccc-svg-wrap">' +
    '        <svg data-ccc-el="svg" role="img" aria-label="Контур стелі, вигляд зверху"></svg>' +
    '        <div class="ccc-zoom-hint">колесо / щипок — масштаб, перетягування — панорама</div>' +
    '      </div>' +
    '      <div class="ccc-results">' +
    '        <div class="ccc-result"><span>Площа</span><b data-ccc-el="rArea">—</b><small>м²</small></div>' +
    '        <div class="ccc-result"><span>Периметр</span><b data-ccc-el="rPerimeter">—</b><small>м</small></div>' +
    '        <div class="ccc-result"><span>Криволінійні ділянки</span><b data-ccc-el="rCurved">—</b><small>м</small></div>' +
    '        <div class="ccc-result"><span>Ребра</span><b data-ccc-el="rEdges">—</b><small>до → після</small></div>' +
    '        <div class="ccc-result ccc-result-wide"><span>Габарити</span><b data-ccc-el="rSize">—</b><small>мм</small></div>' +
    '      </div>' +
    '      <div class="ccc-downloads">' +
    '        <button type="button" class="ccc-btn ccc-btn-primary" data-ccc-action="download-glc" data-ccc-el="downloadGlc" disabled>Завантажити GLC</button>' +
    '        <button type="button" class="ccc-btn ccc-btn-ghost" data-ccc-action="download-dxf" data-ccc-el="downloadDxf" disabled>DXF</button>' +
    '        <button type="button" class="ccc-btn ccc-btn-ghost" data-ccc-action="download-svg" data-ccc-el="downloadSvg" disabled>SVG</button>' +
    '      </div>' +
    '      <p class="ccc-fineprint">Файл GLC формується у windows-1251 з CRLF. Дані нікуди не надсилаються — усе рахується у вашому браузері.</p>' +
    '    </section>' +
    '  </div>' +
    '</div>';

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function displayNumber(value, digits) {
    var s = core.formatNumber(value, digits === undefined ? 2 : digits);
    return s;
  }

  function formatInput(value, digits) {
    if (value === null || value === undefined || value === "") return "";
    var n = core.parseNumber(value);
    if (n === null) return String(value);
    return core.formatNumber(n, typeof digits === "number" ? digits : 2);
  }

  function emptyRow() {
    return { dA: "", dB: "", dC: "", corner: false, straight: false, chord: "" };
  }

  function makeRows(count) {
    var rows = [];
    for (var i = 0; i < count; i += 1) rows.push(emptyRow());
    return rows;
  }

  function deterministicRandom(seed) {
    var a = seed >>> 0;
    return function () {
      a += 0x6d2b79f5;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gaussianFrom(rng) {
    var u = 0;
    var v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function defaultState(root) {
    var unit = root.getAttribute("data-unit") || "cm";
    if (!core.UNIT_TO_MM[unit]) unit = "cm";
    var rowsCount = clamp(parseInt(root.getAttribute("data-rows"), 10) || 12, 1, 100);
    var sigma = core.parseNumber(root.getAttribute("data-sigma"));
    var tol = core.parseNumber(root.getAttribute("data-tol"));
    return {
      version: 1,
      objectName: "",
      unit: unit,
      ab: "",
      ac: "",
      bc: "",
      sigma: sigma === null ? 3 : sigma,
      tol: tol === null ? 3 : tol,
      mirror: false,
      extra: false,
      showPoints: true,
      showDims: false,
      rows: makeRows(rowsCount)
    };
  }

  function normalizeState(saved) {
    if (!saved || typeof saved !== "object" || !Array.isArray(saved.rows)) return null;
    var state = {
      version: 1,
      objectName: typeof saved.objectName === "string" ? saved.objectName : "",
      unit: core.UNIT_TO_MM[saved.unit] ? saved.unit : "cm",
      ab: saved.ab === null || saved.ab === undefined ? "" : String(saved.ab),
      ac: saved.ac === null || saved.ac === undefined ? "" : String(saved.ac),
      bc: saved.bc === null || saved.bc === undefined ? "" : String(saved.bc),
      sigma: core.parseNumber(saved.sigma) === null ? 3 : core.parseNumber(saved.sigma),
      tol: core.parseNumber(saved.tol) === null ? 3 : core.parseNumber(saved.tol),
      mirror: !!saved.mirror,
      extra: !!saved.extra,
      showPoints: saved.showPoints !== false,
      showDims: !!saved.showDims,
      rows: []
    };
    saved.rows.forEach(function (row) {
      state.rows.push({
        dA: row && row.dA !== undefined && row.dA !== null ? String(row.dA) : "",
        dB: row && row.dB !== undefined && row.dB !== null ? String(row.dB) : "",
        dC: row && row.dC !== undefined && row.dC !== null ? String(row.dC) : "",
        corner: !!(row && row.corner),
        straight: !!(row && row.straight),
        chord: row && row.chord !== undefined && row.chord !== null ? String(row.chord) : ""
      });
    });
    if (state.rows.length === 0) state.rows = makeRows(3);
    return state;
  }

  function initRoot(root, index) {
    if (!root.querySelector(".ccc-app")) {
      root.insertAdjacentHTML("beforeend", TEMPLATE);
    }
    var els = {};
    root.querySelectorAll("[data-ccc-el]").forEach(function (el) {
      els[el.getAttribute("data-ccc-el")] = el;
    });
    if (!els.svg || !els.tbody) return;

    var storageKey = STORAGE_PREFIX + location.pathname + ":" + index;
    var state = loadState();
    var result = null;
    var importMessages = [];
    var timer = null;
    var view = null;
    var userView = false;
    var themeColors = readThemeColors(root);
    var pointers = {};
    var gesture = null;

    function loadState() {
      try {
        var raw = window.localStorage.getItem(storageKey);
        if (raw) {
          var restored = normalizeState(JSON.parse(raw));
          if (restored) return restored;
        }
      } catch (e) {
        // localStorage may be disabled; the calculator must still work.
      }
      return defaultState(root);
    }

    function saveState() {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(state));
      } catch (e) {
        // ignore
      }
    }

    function schedule(immediate) {
      if (timer) window.clearTimeout(timer);
      if (immediate) {
        update();
      } else {
        timer = window.setTimeout(update, 150);
      }
    }

    function unitScale() {
      return core.UNIT_TO_MM[state.unit] || 1;
    }

    function toMm(value) {
      return core.toMm(value, state.unit);
    }

    function setElementText(el, text) {
      if (el) el.textContent = text;
    }

    function syncSettings() {
      if (els.title) {
        var title = root.getAttribute("data-title");
        setElementText(els.title, title || "Калькулятор контуру стелі");
      }
      if (els.objectName) els.objectName.value = state.objectName;
      if (els.unit) els.unit.value = state.unit;
      if (els.ab) els.ab.value = state.ab;
      if (els.ac) els.ac.value = state.ac;
      if (els.bc) els.bc.value = state.bc;
      if (els.sigma) els.sigma.value = formatInput(state.sigma);
      if (els.tol) els.tol.value = formatInput(state.tol);
      if (els.extra) els.extra.checked = state.extra;
      if (els.mirror) els.mirror.checked = state.mirror;
      if (els.showPoints) els.showPoints.checked = state.showPoints;
      if (els.showDims) els.showDims.checked = state.showDims;
      if (els.mirrorButton) els.mirrorButton.setAttribute("aria-pressed", state.mirror ? "true" : "false");
      root.classList.toggle("ccc-mirrored", state.mirror);
      applyExtraColumns();
    }

    function applyExtraColumns() {
      root.classList.toggle("ccc-extra-on", state.extra);
      root.querySelectorAll('[data-ccc-col="extra"]').forEach(function (el) {
        el.hidden = !state.extra;
      });
    }

    function renderTable() {
      var tbody = els.tbody;
      tbody.textContent = "";
      var frag = document.createDocumentFragment();
      state.rows.forEach(function (row, rowIndex) {
        var tr = document.createElement("tr");
        tr.setAttribute("data-row", String(rowIndex));

        var tdNum = document.createElement("td");
        tdNum.className = "ccc-num";
        tdNum.textContent = String(rowIndex + 1);
        tr.appendChild(tdNum);

        ["dA", "dB"].forEach(function (field) {
          tr.appendChild(inputCell(field, row[field], rowIndex));
        });

        var tdC = inputCell("dC", row.dC, rowIndex);
        tdC.setAttribute("data-ccc-col", "extra");
        tdC.hidden = !state.extra;
        tr.appendChild(tdC);

        tr.appendChild(flagCell("corner", row.corner, rowIndex));
        tr.appendChild(flagCell("straight", row.straight, rowIndex));

        var tdChord = inputCell("chord", row.chord, rowIndex);
        tdChord.setAttribute("data-ccc-col", "extra");
        tdChord.hidden = !state.extra;
        tr.appendChild(tdChord);

        var tdStatus = document.createElement("td");
        tdStatus.className = "ccc-status-cell";
        var badge = document.createElement("span");
        badge.className = "ccc-badge";
        badge.setAttribute("data-status", String(rowIndex));
        badge.textContent = "—";
        tdStatus.appendChild(badge);
        tr.appendChild(tdStatus);

        var tdDel = document.createElement("td");
        tdDel.className = "ccc-del-cell";
        var del = document.createElement("button");
        del.type = "button";
        del.className = "ccc-icon-btn";
        del.setAttribute("data-action-delete", String(rowIndex));
        del.setAttribute("aria-label", "Видалити рядок " + (rowIndex + 1));
        del.textContent = "×";
        tdDel.appendChild(del);
        tr.appendChild(tdDel);

        frag.appendChild(tr);
      });
      tbody.appendChild(frag);
    }

    function inputCell(field, value, rowIndex) {
      var td = document.createElement("td");
      var input = document.createElement("input");
      input.type = "text";
      input.inputMode = "decimal";
      input.autocomplete = "off";
      input.className = "ccc-cell-input";
      input.setAttribute("data-field", field);
      input.setAttribute("data-row", String(rowIndex));
      input.setAttribute("aria-label", columnLabel(field) + ", рядок " + (rowIndex + 1));
      input.value = value;
      td.appendChild(input);
      return td;
    }

    function flagCell(field, checked, rowIndex) {
      var td = document.createElement("td");
      td.className = "ccc-flag-cell";
      var input = document.createElement("input");
      input.type = "checkbox";
      input.setAttribute("data-field", field);
      input.setAttribute("data-row", String(rowIndex));
      input.setAttribute("aria-label", columnLabel(field) + ", рядок " + (rowIndex + 1));
      input.checked = !!checked;
      td.appendChild(input);
      return td;
    }

    function columnLabel(field) {
      if (field === "dA") return "Відстань від A";
      if (field === "dB") return "Відстань від B";
      if (field === "dC") return "Відстань від C";
      if (field === "corner") return "Кут";
      if (field === "straight") return "Пряма до наступної точки";
      if (field === "chord") return "Хорда до наступної точки";
      return field;
    }

    function focusCell(rowIndex, field) {
      var input = els.tbody.querySelector(
        'input[data-row="' + rowIndex + '"][data-field="' + field + '"]'
      );
      if (input) {
        input.focus();
        if (input.select) input.select();
      }
    }

    function readSettings() {
      state.objectName = els.objectName ? els.objectName.value : "";
      state.ab = els.ab ? els.ab.value : "";
      state.ac = els.ac ? els.ac.value : "";
      state.bc = els.bc ? els.bc.value : "";
      var sigma = core.parseNumber(els.sigma ? els.sigma.value : "");
      var tol = core.parseNumber(els.tol ? els.tol.value : "");
      state.sigma = sigma === null ? 3 : sigma;
      state.tol = tol === null ? 3 : tol;
      state.mirror = !!(els.mirror && els.mirror.checked);
      state.extra = !!(els.extra && els.extra.checked);
      state.showPoints = !!(els.showPoints && els.showPoints.checked);
      state.showDims = !!(els.showDims && els.showDims.checked);
    }

    function buildModel() {
      return state.rows.map(function (row) {
        return {
          dA: row.dA,
          dB: row.dB,
          dC: row.dC,
          corner: !!row.corner,
          straight: !!row.straight,
          chord: row.chord
        };
      });
    }

    function rowHasData(row) {
      return !!(
        String(row.dA || "").trim() ||
        String(row.dB || "").trim() ||
        String(row.dC || "").trim() ||
        String(row.chord || "").trim() ||
        row.corner ||
        row.straight
      );
    }

    function calculate() {
      var lastData = -1;
      state.rows.forEach(function (row, idx) {
        if (rowHasData(row)) lastData = idx;
      });
      if (lastData < 0 && core.parseNumber(state.ab) === null) {
        return null;
      }
      var activeRows = state.rows.slice(0, lastData + 1);
      var rows = activeRows.map(function (row) {
        return {
          dA: toMm(row.dA),
          dB: toMm(row.dB),
          dC: toMm(row.dC),
          corner: !!row.corner,
          straight: !!row.straight,
          chord: toMm(row.chord)
        };
      });
      return core.buildContour({
        ab: toMm(state.ab),
        ac: toMm(state.ac),
        bc: toMm(state.bc),
        points: rows,
        sigma: state.sigma,
        tol: state.tol,
        mirror: state.mirror
      });
    }

    function update() {
      readSettings();
      result = calculate();
      updateStatuses();
      updateMessages();
      updateResults();
      updateDownloads();
      renderPreview(false);
      saveState();
    }

    function updateStatuses() {
      var statuses = {};
      var chordRows = {};
      if (result && result.warnings) {
        result.warnings.forEach(function (w) {
          if (w.code === "chord") {
            if (w.row) chordRows[w.row - 1] = true;
            if (w.row2) chordRows[w.row2 - 1] = true;
          }
        });
      }
      root.querySelectorAll("[data-status]").forEach(function (badge) {
        var idx = parseInt(badge.getAttribute("data-status"), 10);
        var row = result && result.rows ? result.rows[idx] : null;
        var tr = badge.closest("tr");
        if (tr) {
          tr.classList.remove("ccc-row-warn", "ccc-row-error", "ccc-row-chord", "ccc-row-ok");
          if (chordRows[idx]) tr.classList.add("ccc-row-chord");
        }
        badge.className = "ccc-badge";
        if (!row) {
          badge.textContent = "—";
          badge.title = "";
          return;
        }
        if (!row.ok || row.status === "error" || row.bad) {
          badge.textContent = "✗";
          badge.classList.add("ccc-badge-error");
          badge.title = (row.messages && row.messages.join(" ")) || row.message || "Помилка заміру";
          if (tr) tr.classList.add("ccc-row-error");
        } else if (row.status === "warn") {
          badge.textContent = "⚠" + (isFinite(row.sigmaPos) ? " ±" + Math.round(row.sigmaPos) : "");
          badge.classList.add("ccc-badge-warn");
          badge.title = (row.messages && row.messages.join(" ")) || "Низька точність";
          if (tr) tr.classList.add("ccc-row-warn");
        } else {
          badge.textContent = isFinite(row.sigmaPos) ? "✓ ±" + Math.max(1, Math.round(row.sigmaPos)) : "✓";
          badge.classList.add("ccc-badge-ok");
          badge.title = "Точність у нормі";
          if (tr) tr.classList.add("ccc-row-ok");
        }
      });
    }

    function updateMessages() {
      var box = els.messages;
      box.textContent = "";
      var all = [];
      if (result && result.errors) {
        result.errors.forEach(function (e) {
          all.push({ type: "error", text: e.message });
        });
      }
      importMessages.forEach(function (e) {
        all.push({ type: e.type || "error", text: e.text });
      });
      if (result && result.warnings) {
        result.warnings.forEach(function (w) {
          all.push({ type: w.code === "point_error" ? "error" : "warn", text: w.message });
        });
      }
      var hasImportError = importMessages.some(function (e) {
        return e.type !== "info";
      });
      if (result && result.ok && result.warnings.length === 0 && !hasImportError) {
        var ok = document.createElement("div");
        ok.className = "ccc-msg ccc-msg-ok";
        ok.textContent = "Контур побудовано. Можна завантажувати GLC.";
        box.appendChild(ok);
        importMessages.forEach(function (e) {
          if (e.type !== "info") return;
          var info = document.createElement("div");
          info.className = "ccc-msg ccc-msg-ok";
          info.textContent = e.text;
          box.appendChild(info);
        });
      } else {
        all.forEach(function (item) {
          var div = document.createElement("div");
          div.className = "ccc-msg ccc-msg-" + (item.type === "info" ? "ok" : item.type);
          div.textContent = item.text;
          box.appendChild(div);
        });
      }
    }

    function updateResults() {
      var stats = result && result.ok ? result.stats : null;
      setElementText(els.rArea, stats ? displayNumber(stats.areaM2, 2) : "—");
      setElementText(els.rPerimeter, stats ? displayNumber(stats.perimeterM, 2) : "—");
      setElementText(els.rCurved, stats ? displayNumber(stats.curvedM, 2) : "—");
      setElementText(
        els.rEdges,
        stats ? stats.edgeCountBefore + " → " + stats.edgeCountAfter : "—"
      );
      setElementText(
        els.rSize,
        stats ? Math.round(stats.widthMm) + " × " + Math.round(stats.heightMm) : "—"
      );

      if (!result) {
        setElementText(els.status, "Готово до введення замірів.");
      } else if (!result.ok) {
        setElementText(els.status, "Побудова неможлива: виправте помилки в таблиці.");
      } else {
        var warnings = result.warnings.length;
        setElementText(
          els.status,
          warnings > 0
            ? "Контур побудовано з попередженнями (" + warnings + ")."
            : "Контур побудовано без помилок."
        );
      }
    }

    function updateDownloads() {
      var ok = !!(result && result.ok);
      [els.downloadGlc, els.downloadDxf, els.downloadSvg].forEach(function (btn) {
        if (btn) btn.disabled = !ok;
      });
    }

    /* ----------------------------- preview ----------------------------- */

    function readThemeColors(node) {
      var style = window.getComputedStyle(node);
      function css(name, fallback) {
        var v = style.getPropertyValue(name);
        return v && v.trim() ? v.trim() : fallback;
      }
      return {
        text: css("--ccc-text", "#1f2a24"),
        muted: css("--ccc-muted", "#5e6c63"),
        line: css("--ccc-line", "#d0d8d1"),
        accent: css("--ccc-accent", "#2f6d4e"),
        accentSoft: css("--ccc-accent-soft", "#edf7f1"),
        error: css("--ccc-error", "#b42318"),
        warn: css("--ccc-warn", "#b26d00"),
        wall: css("--ccc-wall", "#b26d00"),
        bg: css("--ccc-svg-bg", "#ffffff")
      };
    }

    function screenPoint(p) {
      return { x: p.x, y: -p.y };
    }

    function resultBounds(res) {
      var b = res.stats.bounds;
      var minX = Math.min(b.minX, 0);
      var maxX = Math.max(b.maxX, res.ab || 0);
      var minY = Math.min(b.minY, 0);
      var maxY = Math.max(b.maxY, 0);
      if (res.cPoint) {
        minX = Math.min(minX, res.cPoint.x);
        maxX = Math.max(maxX, res.cPoint.x);
        minY = Math.min(minY, res.cPoint.y);
        maxY = Math.max(maxY, res.cPoint.y);
      }
      return { minX: minX, maxX: maxX, minY: minY, maxY: maxY };
    }

    function fitView(res) {
      var b = resultBounds(res);
      var screenW = Math.max(1, b.maxX - b.minX);
      var screenH = Math.max(1, b.maxY - b.minY);
      var margin = Math.max(120, Math.max(screenW, screenH) * 0.07);
      var x = b.minX - margin;
      var y = -b.maxY - margin;
      var w = screenW + margin * 2;
      var h = screenH + margin * 2;
      var rect = els.svg.getBoundingClientRect();
      var aspect = rect.width > 0 && rect.height > 0 ? rect.width / rect.height : 1.4;
      if (w / h > aspect) {
        var newH = w / aspect;
        y -= (newH - h) / 2;
        h = newH;
      } else {
        var newW = h * aspect;
        x -= (newW - w) / 2;
        w = newW;
      }
      return { x: x, y: y, w: w, h: h };
    }

    function applyViewBox() {
      if (!view) return;
      els.svg.setAttribute(
        "viewBox",
        core.formatNumber(view.x, 2) + " " + core.formatNumber(view.y, 2) + " " +
          core.formatNumber(view.w, 2) + " " + core.formatNumber(view.h, 2)
      );
    }

    function svgEl(name, attrs) {
      var el = document.createElementNS(SVG_NS, name);
      if (attrs) {
        Object.keys(attrs).forEach(function (key) {
          el.setAttribute(key, attrs[key]);
        });
      }
      return el;
    }

    function renderPreview(forceFit) {
      var svg = els.svg;
      svg.textContent = "";
      themeColors = readThemeColors(root);

      if (!result || !result.ok) {
        if (!view) {
          view = { x: 0, y: -3000, w: 6000, h: 4000 };
          applyViewBox();
        }
        var bg = svgEl("rect", { x: view.x, y: view.y, width: view.w, height: view.h, fill: themeColors.bg });
        svg.appendChild(bg);
        var tx = svgEl("text", {
          x: view.x + view.w / 2,
          y: view.y + view.h / 2,
          "text-anchor": "middle",
          fill: themeColors.muted,
          "font-size": Math.max(24, view.w / 40),
          "font-family": "Segoe UI, Tahoma, sans-serif"
        });
        tx.textContent = "Введіть AB і хоча б три точки — контур з’явиться тут";
        svg.appendChild(tx);
        return;
      }

      if (forceFit || !view) {
        view = fitView(result);
        userView = false;
      } else if (!userView) {
        view = fitView(result);
      }
      applyViewBox();

      var b = resultBounds(result);
      var margin = Math.max(120, Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.08);
      svg.appendChild(
        svgEl("rect", {
          x: view.x - margin,
          y: view.y - margin,
          width: view.w + margin * 2,
          height: view.h + margin * 2,
          fill: themeColors.bg
        })
      );

      var fs = Math.max(18, view.w / 58);
      var dotR = Math.max(5, view.w / 150);
      var small = fs * 0.72;

      // AB wall.
      var yWall = 0;
      svg.appendChild(
        svgEl("line", {
          x1: 0,
          y1: yWall,
          x2: result.ab,
          y2: yWall,
          stroke: themeColors.wall,
          "stroke-width": 2,
          "stroke-dasharray": "10 7",
          "vector-effect": "non-scaling-stroke"
        })
      );
      var labelA = svgEl("text", {
        x: -fs * 0.9,
        y: fs * 0.35,
        fill: themeColors.accent,
        "font-size": fs,
        "font-family": "Segoe UI, Tahoma, sans-serif",
        "font-weight": "600"
      });
      labelA.textContent = "A";
      svg.appendChild(labelA);
      var labelB = svgEl("text", {
        x: result.ab + fs * 0.35,
        y: fs * 0.35,
        fill: themeColors.accent,
        "font-size": fs,
        "font-family": "Segoe UI, Tahoma, sans-serif",
        "font-weight": "600"
      });
      labelB.textContent = "B";
      svg.appendChild(labelB);

      // Contour.
      var d = "";
      result.edges.forEach(function (edge, edgeIndex) {
        var pts = core.sampleEdge(edge, 2);
        pts.forEach(function (p, i) {
          if (edgeIndex === 0 && i === 0) {
            d += "M " + core.formatNumber(p.x, 2) + " " + core.formatNumber(-p.y, 2);
          } else if (i > 0 || edgeIndex > 0) {
            d += " L " + core.formatNumber(p.x, 2) + " " + core.formatNumber(-p.y, 2);
          }
        });
      });
      d += " Z";
      svg.appendChild(
        svgEl("path", {
          d: d,
          fill: themeColors.accentSoft,
          "fill-opacity": "0.55",
          stroke: themeColors.accent,
          "stroke-width": 3,
          "stroke-linejoin": "round",
          "stroke-linecap": "round",
          "vector-effect": "non-scaling-stroke"
        })
      );

      // C reference.
      if (result.cPoint) {
        var cp = screenPoint(result.cPoint);
        svg.appendChild(
          svgEl("circle", {
            cx: cp.x,
            cy: cp.y,
            r: dotR,
            fill: themeColors.accent,
            stroke: themeColors.bg,
            "stroke-width": 2,
            "vector-effect": "non-scaling-stroke"
          })
        );
        var cLabel = svgEl("text", {
          x: cp.x + dotR * 1.5,
          y: cp.y - dotR * 1.1,
          fill: themeColors.accent,
          "font-size": fs,
          "font-family": "Segoe UI, Tahoma, sans-serif",
          "font-weight": "600"
        });
        cLabel.textContent = "C";
        svg.appendChild(cLabel);
      }

      // Measured points.
      if (state.showPoints && result.points) {
        result.points.forEach(function (p, idx) {
          var sp = screenPoint(p);
          var row = result.rows ? result.rows[idx] : null;
          var color = themeColors.accent;
          if (row && (row.status === "warn" || row.bad)) color = themeColors.warn;
          if (row && (row.status === "error" || row.bad)) color = themeColors.error;
          svg.appendChild(
            svgEl("circle", {
              cx: sp.x,
              cy: sp.y,
              r: dotR,
              fill: color,
              stroke: themeColors.bg,
              "stroke-width": 1.5,
              "vector-effect": "non-scaling-stroke"
            })
          );
          var label = svgEl("text", {
            x: sp.x + dotR * 1.6,
            y: sp.y + dotR * 2.2,
            fill: color,
            "font-size": small,
            "font-family": "Segoe UI, Tahoma, sans-serif"
          });
          label.textContent = String(idx + 1);
          svg.appendChild(label);
        });
      }

      // Edge dimensions.
      if (state.showDims && result.edges) {
        result.edges.forEach(function (edge) {
          var mid = edge.type === "arc"
            ? edge.arcPoint
            : { x: (edge.start.x + edge.end.x) / 2, y: (edge.start.y + edge.end.y) / 2 };
          var sp = screenPoint(mid);
          var text = edge.type === "arc"
            ? "R" + Math.round(edge.radius) + " / " + Math.round(edge.length)
            : String(Math.round(edge.chord));
          var label = svgEl("text", {
            x: sp.x + dotR * 0.8,
            y: sp.y - dotR * 0.8,
            fill: themeColors.muted,
            "font-size": small,
            "font-family": "Segoe UI, Tahoma, sans-serif"
          });
          label.textContent = text;
          svg.appendChild(label);
        });
      }
    }

    function clientToUser(clientX, clientY) {
      var rect = els.svg.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
      return {
        x: view.x + ((clientX - rect.left) / rect.width) * view.w,
        y: view.y + ((clientY - rect.top) / rect.height) * view.h
      };
    }

    function zoomAt(clientX, clientY, factor) {
      if (!view) return;
      var p = clientToUser(clientX, clientY);
      var newW = clamp(view.w * factor, 50, 500000);
      var scale = newW / view.w;
      view.x = p.x - (p.x - view.x) * scale;
      view.y = p.y - (p.y - view.y) * scale;
      view.w = newW;
      view.h *= scale;
      userView = true;
      applyViewBox();
    }

    var viewTimer = null;

    function onWheel(event) {
      if (!result || !result.ok) return;
      event.preventDefault();
      var factor = event.deltaY > 0 ? 1.14 : 1 / 1.14;
      zoomAt(event.clientX, event.clientY, factor);
      if (viewTimer) window.clearTimeout(viewTimer);
      viewTimer = window.setTimeout(function () {
        renderPreview(false);
        applyViewBox();
      }, 80);
    }

    function onPointerDown(event) {
      if (!result || !result.ok) return;
      els.svg.setPointerCapture(event.pointerId);
      pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
      var ids = Object.keys(pointers);
      if (ids.length === 1) {
        gesture = {
          type: "pan",
          startX: event.clientX,
          startY: event.clientY,
          view: { x: view.x, y: view.y, w: view.w, h: view.h }
        };
      } else if (ids.length === 2) {
        var p1 = pointers[ids[0]];
        var p2 = pointers[ids[1]];
        gesture = {
          type: "pinch",
          startDist: Math.hypot(p1.x - p2.x, p1.y - p2.y),
          startCenter: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
          view: { x: view.x, y: view.y, w: view.w, h: view.h }
        };
      }
      els.svg.classList.add("ccc-dragging");
    }

    function onPointerMove(event) {
      if (!pointers[event.pointerId] || !gesture || !view) return;
      pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
      var ids = Object.keys(pointers);
      if (gesture.type === "pan" && ids.length === 1) {
        var rect = els.svg.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        var dx = ((event.clientX - gesture.startX) / rect.width) * gesture.view.w;
        var dy = ((event.clientY - gesture.startY) / rect.height) * gesture.view.h;
        view.x = gesture.view.x - dx;
        view.y = gesture.view.y - dy;
        userView = true;
        applyViewBox();
      } else if (gesture.type === "pinch" && ids.length >= 2) {
        var p1 = pointers[ids[0]];
        var p2 = pointers[ids[1]];
        var dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        var center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        var rect2 = els.svg.getBoundingClientRect();
        var startUser = {
          x: gesture.view.x + ((gesture.startCenter.x - rect2.left) / rect2.width) * gesture.view.w,
          y: gesture.view.y + ((gesture.startCenter.y - rect2.top) / rect2.height) * gesture.view.h
        };
        var factor = gesture.startDist / Math.max(1, dist);
        var newW = clamp(gesture.view.w * factor, 50, 500000);
        var scale = newW / gesture.view.w;
        view.w = newW;
        view.h = gesture.view.h * scale;
        view.x = startUser.x - ((gesture.startCenter.x - rect2.left) / rect2.width) * view.w;
        view.y = startUser.y - ((gesture.startCenter.y - rect2.top) / rect2.height) * view.h;
        userView = true;
        applyViewBox();
      }
    }

    function onPointerUp(event) {
      delete pointers[event.pointerId];
      if (Object.keys(pointers).length === 0) {
        gesture = null;
        els.svg.classList.remove("ccc-dragging");
        renderPreview(false);
        applyViewBox();
      } else if (Object.keys(pointers).length === 1 && gesture && gesture.type === "pinch") {
        var id = Object.keys(pointers)[0];
        gesture = {
          type: "pan",
          startX: pointers[id].x,
          startY: pointers[id].y,
          view: { x: view.x, y: view.y, w: view.w, h: view.h }
        };
      }
    }

    /* ----------------------------- actions ----------------------------- */

    function addRows(count) {
      for (var i = 0; i < count; i += 1) state.rows.push(emptyRow());
      renderTable();
      schedule(true);
    }

    function removeRow(index) {
      if (state.rows.length <= 1) {
        state.rows[0] = emptyRow();
      } else {
        state.rows.splice(index, 1);
      }
      renderTable();
      schedule(true);
    }

    function clearAll() {
      var ok = window.confirm("Очистити всі введені дані? Налаштування залишаться.");
      if (!ok) return;
      state.ab = "";
      state.ac = "";
      state.bc = "";
      state.objectName = "";
      state.rows = makeRows(Math.max(3, state.rows.length));
      importMessages = [];
      syncSettings();
      renderTable();
      schedule(true);
    }

    function loadExample() {
      var ab = 5200;
      var c = { x: 5200, y: -3900 };
      var ref = [
        { x: 500, y: -300, corner: true, straight: true },
        { x: 1500, y: -280, corner: false, straight: false },
        { x: 2300, y: -350, corner: false, straight: false },
        { x: 3000, y: -750, corner: true, straight: true },
        { x: 3600, y: -750, corner: true, straight: false },
        { x: 4300, y: -500, corner: false, straight: false },
        { x: 4700, y: -1300, corner: false, straight: false },
        { x: 4400, y: -2400, corner: false, straight: false },
        { x: 3500, y: -3000, corner: false, straight: false },
        { x: 2400, y: -3200, corner: false, straight: false },
        { x: 1300, y: -2900, corner: false, straight: false },
        { x: 600, y: -2000, corner: false, straight: false }
      ];
      var rng = deterministicRandom(20261111);
      var scale = core.UNIT_TO_MM[state.unit] || 1;
      state.objectName = "Демо: вітальня";
      state.ab = formatInput(ab / scale);
      state.ac = formatInput(Math.hypot(c.x, c.y) / scale);
      state.bc = formatInput(Math.hypot(c.x - ab, c.y) / scale);
      state.rows = ref.map(function (p) {
        var dA = Math.hypot(p.x, p.y) + gaussianFrom(rng) * 2;
        var dB = Math.hypot(p.x - ab, p.y) + gaussianFrom(rng) * 2;
        var dC = Math.hypot(p.x - c.x, p.y - c.y) + gaussianFrom(rng) * 2;
        return {
          dA: formatInput(dA / scale),
          dB: formatInput(dB / scale),
          dC: formatInput(dC / scale),
          corner: p.corner,
          straight: p.straight,
          chord: ""
        };
      });
      state.extra = true;
      importMessages = [];
      syncSettings();
      renderTable();
      view = null;
      schedule(true);
    }

    function applyCsvText(text, sourceLabel) {
      var parsed = core.parseCsvText(text);
      importMessages = parsed.errors.map(function (e) {
        return { text: (sourceLabel ? sourceLabel + ": " : "") + e.message };
      });
      if (parsed.unit) state.unit = parsed.unit;
      else {
        importMessages.push({
          type: "info",
          text: "У файлі не вказані одиниці — використано поточні (" + state.unit + ")."
        });
      }
      if (parsed.ab !== null && parsed.ab !== undefined) state.ab = formatInput(parsed.ab);
      if (parsed.ac !== null && parsed.ac !== undefined) state.ac = formatInput(parsed.ac);
      if (parsed.bc !== null && parsed.bc !== undefined) state.bc = formatInput(parsed.bc);
      if (parsed.sigma !== null && parsed.sigma !== undefined && parsed.sigma > 0) state.sigma = parsed.sigma;
      if (parsed.tol !== null && parsed.tol !== undefined && parsed.tol >= 0) state.tol = parsed.tol;
      if (parsed.objectName) state.objectName = parsed.objectName;
      if (parsed.rows.length > 0) {
        state.rows = parsed.rows.map(function (row) {
          return {
            dA: row.dA,
            dB: row.dB,
            dC: row.dC,
            corner: row.corner,
            straight: row.straight,
            chord: row.chord
          };
        });
        var hasExtra = parsed.rows.some(function (row) {
          return row.dC !== "" || row.chord !== "";
        });
        if (hasExtra) state.extra = true;
        view = null;
      }
      syncSettings();
      renderTable();
      schedule(true);
      if (parsed.rows.length > 0) {
        importMessages.push({
          type: "info",
          text: "Імпортовано точок: " + parsed.rows.length + "."
        });
        updateMessages();
      }
    }

    function downloadBlob(blob, filename) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 1000);
    }

    function baseName() {
      return core.slugFilename(state.objectName, "kontur-steli");
    }

    function downloadGlc() {
      if (!result || !result.ok) return;
      var bytes = core.buildGlcBytes(result);
      downloadBlob(new Blob([bytes], { type: "application/octet-stream" }), baseName() + ".glc");
    }

    function downloadDxf() {
      if (!result || !result.ok) return;
      var text = core.buildDxf(result);
      downloadBlob(new Blob([text], { type: "application/dxf;charset=utf-8" }), baseName() + ".dxf");
    }

    function downloadSvg() {
      if (!result || !result.ok) return;
      var text = core.buildSvg(result, {
        title: state.objectName,
        showPoints: state.showPoints,
        showDims: state.showDims
      });
      downloadBlob(new Blob([text], { type: "image/svg+xml;charset=utf-8" }), baseName() + ".svg");
    }

    function downloadCsv() {
      var csv = core.formatCsv({
        unit: state.unit,
        sigma: state.sigma,
        tol: state.tol,
        ab: state.ab,
        ac: state.ac,
        bc: state.bc,
        objectName: state.objectName,
        rows: state.rows
      });
      downloadBlob(
        new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }),
        baseName() + "-dani.csv"
      );
    }

    function downloadTemplate() {
      downloadBlob(
        new Blob(["\uFEFF" + core.buildCsvTemplate()], { type: "text/csv;charset=utf-8" }),
        "shablon-kontur-steli.csv"
      );
    }

    function changeUnit(newUnit) {
      if (!core.UNIT_TO_MM[newUnit] || newUnit === state.unit) return;
      var factor = (core.UNIT_TO_MM[state.unit] || 1) / core.UNIT_TO_MM[newUnit];
      // Meters need more decimals so a unit switch does not lose millimetres.
      var digits = newUnit === "m" ? 3 : 1;
      function convert(value) {
        var n = core.parseNumber(value);
        return n === null ? value : formatInput(n * factor, digits);
      }
      state.ab = convert(state.ab);
      state.ac = convert(state.ac);
      state.bc = convert(state.bc);
      state.rows.forEach(function (row) {
        row.dA = convert(row.dA);
        row.dB = convert(row.dB);
        row.dC = convert(row.dC);
        row.chord = convert(row.chord);
      });
      state.unit = newUnit;
      view = null;
      syncSettings();
      renderTable();
      schedule(true);
    }

    /* ----------------------------- events ------------------------------ */

    els.tbody.addEventListener("input", function (event) {
      var input = event.target;
      if (!input || !input.getAttribute("data-field")) return;
      var rowIndex = parseInt(input.getAttribute("data-row"), 10);
      var field = input.getAttribute("data-field");
      if (!state.rows[rowIndex]) return;
      state.rows[rowIndex][field] = input.type === "checkbox" ? input.checked : input.value;
      schedule(false);
    });

    els.tbody.addEventListener("change", function (event) {
      var input = event.target;
      if (!input || input.type !== "checkbox") return;
      var rowIndex = parseInt(input.getAttribute("data-row"), 10);
      var field = input.getAttribute("data-field");
      if (!state.rows[rowIndex]) return;
      state.rows[rowIndex][field] = input.checked;
      schedule(false);
    });

    els.tbody.addEventListener("keydown", function (event) {
      var input = event.target;
      if (!input || input.tagName !== "INPUT" || input.type === "checkbox") return;
      if (event.key !== "Enter") return;
      event.preventDefault();
      var rowIndex = parseInt(input.getAttribute("data-row"), 10);
      var field = input.getAttribute("data-field");
      if (rowIndex === state.rows.length - 1) {
        state.rows.push(emptyRow());
        renderTable();
        schedule(false);
        focusCell(rowIndex + 1, field);
      } else {
        focusCell(rowIndex + 1, field);
      }
    });

    els.tbody.addEventListener("click", function (event) {
      var target = event.target.closest ? event.target.closest("[data-action-delete]") : null;
      if (!target) return;
      var index = parseInt(target.getAttribute("data-action-delete"), 10);
      removeRow(index);
    });

    if (els.objectName) {
      els.objectName.addEventListener("input", function () {
        state.objectName = els.objectName.value;
        schedule(false);
      });
    }

    ["ab", "ac", "bc", "sigma", "tol"].forEach(function (key) {
      if (!els[key]) return;
      els[key].addEventListener("input", function () {
        state[key] = els[key].value;
        schedule(false);
      });
    });

    if (els.unit) {
      els.unit.addEventListener("change", function () {
        changeUnit(els.unit.value);
      });
    }

    if (els.extra) {
      els.extra.addEventListener("change", function () {
        state.extra = els.extra.checked;
        applyExtraColumns();
        schedule(false);
      });
    }

    if (els.mirror) {
      els.mirror.addEventListener("change", function () {
        state.mirror = els.mirror.checked;
        if (els.mirrorButton) els.mirrorButton.setAttribute("aria-pressed", state.mirror ? "true" : "false");
        schedule(true);
      });
    }

    if (els.showPoints) {
      els.showPoints.addEventListener("change", function () {
        state.showPoints = els.showPoints.checked;
        renderPreview(false);
        schedule(false);
      });
    }
    if (els.showDims) {
      els.showDims.addEventListener("change", function () {
        state.showDims = els.showDims.checked;
        renderPreview(false);
        schedule(false);
      });
    }

    root.addEventListener("click", function (event) {
      var target = event.target.closest ? event.target.closest("[data-ccc-action]") : null;
      if (!target || !root.contains(target)) return;
      var action = target.getAttribute("data-ccc-action");
      if (action === "add-row") addRows(1);
      else if (action === "add-5") addRows(5);
      else if (action === "clear") clearAll();
      else if (action === "example") loadExample();
      else if (action === "import-file") {
        if (els.file) els.file.click();
      } else if (action === "template") downloadTemplate();
      else if (action === "save-csv") downloadCsv();
      else if (action === "import-text") {
        var text = els.paste ? els.paste.value : "";
        if (!text.trim()) {
          importMessages = [{ text: "Поле вставки порожнє." }];
          updateMessages();
          return;
        }
        applyCsvText(text, "Вставка");
      } else if (action === "clear-paste") {
        if (els.paste) els.paste.value = "";
      } else if (action === "mirror") {
        state.mirror = !state.mirror;
        if (els.mirror) els.mirror.checked = state.mirror;
        if (els.mirrorButton) els.mirrorButton.setAttribute("aria-pressed", state.mirror ? "true" : "false");
        schedule(true);
      } else if (action === "fit") {
        view = null;
        userView = false;
        renderPreview(true);
        applyViewBox();
      } else if (action === "download-glc") downloadGlc();
      else if (action === "download-dxf") downloadDxf();
      else if (action === "download-svg") downloadSvg();
    });

    if (els.file) {
      els.file.addEventListener("change", function () {
        var file = els.file.files && els.file.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var bytes = new Uint8Array(reader.result);
            var text = core.decodeBytes(bytes);
            applyCsvText(text, file.name);
          } catch (e) {
            importMessages = [{ text: "Не вдалося прочитати файл: " + (e.message || "помилка") }];
            updateMessages();
          }
          els.file.value = "";
        };
        reader.onerror = function () {
          importMessages = [{ text: "Не вдалося прочитати файл." }];
          updateMessages();
        };
        reader.readAsArrayBuffer(file);
      });
    }

    els.svg.addEventListener("wheel", onWheel, { passive: false });
    els.svg.addEventListener("pointerdown", onPointerDown);
    els.svg.addEventListener("pointermove", onPointerMove);
    els.svg.addEventListener("pointerup", onPointerUp);
    els.svg.addEventListener("pointercancel", onPointerUp);

    if (window.matchMedia) {
      var mq = window.matchMedia("(prefers-color-scheme: dark)");
      var onScheme = function () {
        renderPreview(false);
      };
      if (mq.addEventListener) mq.addEventListener("change", onScheme);
      else if (mq.addListener) mq.addListener(onScheme);
    }
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () {
        if (!userView) {
          renderPreview(false);
          applyViewBox();
        }
      });
      ro.observe(els.svg);
    }

    // Initial paint.
    syncSettings();
    renderTable();
    update();
  }

  function parseBackgroundLuminance(color) {
    if (!color) return null;
    var match = color.match(/rgba?\(([^)]+)\)/);
    if (!match) return null;
    var parts = match[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (parts.length < 3) return null;
    var alpha = parts.length > 3 ? parts[3] : 1;
    if (!isFinite(alpha) || alpha < 0.15) return null;
    return (0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2]) / 255;
  }

  function detectSiteTheme() {
    var roots = document.querySelectorAll("[data-ccc-root]");
    if (!roots.length) return;
    var luminance = parseBackgroundLuminance(
      window.getComputedStyle(document.body).backgroundColor
    );
    if (luminance === null) {
      luminance = parseBackgroundLuminance(
        window.getComputedStyle(document.documentElement).backgroundColor
      );
    }
    if (luminance === null) return;
    var themeClass = luminance < 0.42 ? "ccc-theme-dark" : "ccc-theme-light";
    roots.forEach(function (root) {
      root.classList.remove("ccc-theme-dark", "ccc-theme-light");
      root.classList.add(themeClass);
    });
  }

  function initAll() {
    detectSiteTheme();
    document.querySelectorAll("[data-ccc-root]").forEach(function (root, index) {
      initRoot(root, index);
    });
  }

  ready(initAll);
})();
