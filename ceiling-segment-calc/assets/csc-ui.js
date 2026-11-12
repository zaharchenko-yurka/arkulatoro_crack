/*
 * Ceiling segment calculator - browser UI.
 * Requires window.CSCore. No external libraries, no network calls.
 */
(function () {
  "use strict";

  var core = window.CSCore;
  if (!core) {
    return;
  }

  var SVG_NS = "http://www.w3.org/2000/svg";
  var STORAGE_PREFIX = "csc:v1:";

  var TEMPLATE =
    '<div class="csc-app">' +
    '  <header class="csc-head">' +
    '    <div>' +
    '      <h2 class="csc-title" data-csc-el="title">Калькулятор сегментів кривої стелі</h2>' +
    '      <p class="csc-subtitle">Контур з Arkulator + заміри радіусів і сегментів → готовий .glc</p>' +
    '    </div>' +
    '  </header>' +

    '  <details class="csc-help">' +
    '    <summary>Як працювати — коротка пам’ятка</summary>' +
    '    <div class="csc-help-body">' +
    '      <ol>' +
    '        <li>У Arkulator намалюйте приблизний контур кімнати й збережіть його як <b>.glc</b>. Завантажте файл сюда.</li>' +
    '        <li>Виберіть <b>початковий кут S</b> і <b>кінцевий кут E</b> согнутой сторони (за порядком контуру).</li>' +
    '        <li>Вкажіть <b>кут O</b>, від якого міряли радіуси. Він може бути поза контуром — тоді введіть його X,Y у вибраних одиницях.</li>' +
    '        <li>Заповніть таблицю: для кожної точки — <b>радіус d від O</b> і <b>довжина сегмента s</b> від попередньої точки.</li>' +
    '        <li><b>Останній рядок</b> таблиці — це сам кут E. Його точка фіксується на куті, а d і s слугують контролем.</li>' +
    '        <li>Перевірте прев’ю, за потреби перетягніть точки мишею, збережіть проміжний стан і завантажте <b>.glc</b>.</li>' +
    '      </ol>' +
    '      <p>Сегмент s — це хорда між сусідніми точками (пряма відстань рулеткою). Для дуг це практично збігається з довжиною дуги.</p>' +
    '    </div>' +
    '  </details>' +

    '  <div class="csc-layout">' +
    '    <section class="csc-panel csc-controls" aria-label="Дані замірів">' +
    '      <div class="csc-grid">' +
    '        <label class="csc-field csc-field-wide"><span>Назва об’єкта</span><input type="text" data-csc-el="objectName" autocomplete="off" placeholder="Наприклад: вітальня, вул. Липова"></label>' +
    '        <div class="csc-field csc-field-wide"><span>Контур кімнати (.glc з Arkulator)</span><span class="csc-import-row"><button type="button" class="csc-btn csc-btn-small" data-csc-action="import-glc">Завантажити .glc</button><span class="csc-import-status" data-csc-el="importStatus">файл не завантажено</span></span><input type="file" class="csc-file" data-csc-el="glcFile" accept=".glc,.txt,text/plain" hidden></div>' +
    '        <label class="csc-field"><span>Початковий кут S</span><select data-csc-el="startCorner"></select></label>' +
    '        <label class="csc-field"><span>Кінцевий кут E</span><select data-csc-el="endCorner"></select></label>' +
    '        <label class="csc-field"><span>Кут O — звідки міряли</span><select data-csc-el="originMode"><option value="corner">кут контуру</option><option value="point">ручна точка X,Y</option></select></label>' +
    '        <label class="csc-field" data-csc-el="originCornerField"><span>Кут O</span><select data-csc-el="originCorner"></select></label>' +
    '        <label class="csc-field" data-csc-el="originXField" hidden><span>O — X (у вибраних одиницях)</span><input type="text" inputmode="decimal" data-csc-el="originX" autocomplete="off" placeholder="0"></label>' +
    '        <label class="csc-field" data-csc-el="originYField" hidden><span>O — Y (у вибраних одиницях)</span><input type="text" inputmode="decimal" data-csc-el="originY" autocomplete="off" placeholder="0"></label>' +
    '        <label class="csc-field"><span>Одиниці замірів</span><select data-csc-el="unit"><option value="mm">мм</option><option value="cm">см</option><option value="m">м</option></select></label>' +
    '        <label class="csc-field"><span>Похибка заміру σ, мм</span><input type="text" inputmode="decimal" data-csc-el="sigma" autocomplete="off" value="3"></label>' +
    '      </div>' +

    '      <div class="csc-options">' +
    '        <label class="csc-check"><input type="checkbox" data-csc-el="mirror"><span>Віддзеркалити (Y)</span></label>' +
    '        <label class="csc-check"><input type="checkbox" data-csc-el="showPoints" checked><span>Точки</span></label>' +
    '        <label class="csc-check"><input type="checkbox" data-csc-el="showRadii" checked><span>Радіуси</span></label>' +
    '        <label class="csc-check"><input type="checkbox" data-csc-el="showDims"><span>Розміри</span></label>' +
    '      </div>' +

    '      <div class="csc-toolbar" role="group" aria-label="Операції з таблицею">' +
    '        <button type="button" class="csc-btn csc-btn-small" data-csc-action="add-row">+ рядок</button>' +
    '        <button type="button" class="csc-btn csc-btn-small" data-csc-action="add-5">+5</button>' +
    '        <button type="button" class="csc-btn csc-btn-small csc-btn-ghost" data-csc-action="example">Приклад</button>' +
    '        <button type="button" class="csc-btn csc-btn-small csc-btn-ghost" data-csc-action="reset-offsets">Скинути правки</button>' +
    '        <button type="button" class="csc-btn csc-btn-small csc-btn-ghost" data-csc-action="save-json">Зберегти стан</button>' +
    '        <button type="button" class="csc-btn csc-btn-small csc-btn-ghost" data-csc-action="import-json">Завантажити стан</button>' +
    '        <button type="button" class="csc-btn csc-btn-small csc-btn-danger" data-csc-action="clear">Очистити</button>' +
    '        <input type="file" class="csc-file" data-csc-el="jsonFile" accept=".json,application/json" hidden>' +
    '      </div>' +

    '      <div class="csc-table-wrap">' +
    '        <table class="csc-table">' +
    '          <thead><tr>' +
    '            <th scope="col">№</th>' +
    '            <th scope="col">d від O</th>' +
    '            <th scope="col">Сегмент s</th>' +
    '            <th scope="col" class="csc-th-status">± / Δ</th>' +
    '            <th scope="col"><span class="csc-sr">Дія</span></th>' +
    '          </tr></thead>' +
    '          <tbody data-csc-el="tbody"></tbody>' +
    '        </table>' +
    '      </div>' +

    '      <div class="csc-status" data-csc-el="status" aria-live="polite">Завантажте .glc, щоб почати.</div>' +
    '      <div class="csc-messages" data-csc-el="messages" aria-live="polite"></div>' +
    '    </section>' +

    '    <section class="csc-panel csc-preview" aria-label="Перегляд контуру">' +
    '      <div class="csc-preview-head">' +
    '        <h3>Вигляд зверху</h3>' +
    '        <div class="csc-preview-actions">' +
    '          <button type="button" class="csc-btn csc-btn-small" data-csc-action="mirror" data-csc-el="mirrorButton" aria-pressed="false">Віддзеркалити</button>' +
    '          <button type="button" class="csc-btn csc-btn-small csc-btn-ghost" data-csc-action="fit">Підігнати до екрана</button>' +
    '        </div>' +
    '      </div>' +
    '      <div class="csc-svg-wrap">' +
    '        <svg data-csc-el="svg" role="img" aria-label="Контур стелі, вигляд зверху"></svg>' +
    '        <div class="csc-zoom-hint">колесо / щипок — масштаб, перетягування — панорама, точки можна тягнути</div>' +
    '      </div>' +
    '      <div class="csc-results">' +
    '        <div class="csc-result"><span>Площа</span><b data-csc-el="rArea">—</b><small>м²</small></div>' +
    '        <div class="csc-result"><span>Периметр</span><b data-csc-el="rPerimeter">—</b><small>м</small></div>' +
    '        <div class="csc-result"><span>Криволінійні ділянки</span><b data-csc-el="rCurved">—</b><small>м</small></div>' +
    '        <div class="csc-result"><span>Ребра</span><b data-csc-el="rEdges">—</b><small>дуги</small></div>' +
    '        <div class="csc-result csc-result-wide"><span>Максимальні відхилення</span><b data-csc-el="rResidual">—</b><small>мм</small></div>' +
    '      </div>' +
    '      <div class="csc-downloads">' +
    '        <button type="button" class="csc-btn csc-btn-primary" data-csc-action="download-glc" data-csc-el="downloadGlc" disabled>Завантажити GLC</button>' +
    '        <button type="button" class="csc-btn csc-btn-ghost" data-csc-action="download-dxf" data-csc-el="downloadDxf" disabled>DXF</button>' +
    '        <button type="button" class="csc-btn csc-btn-ghost" data-csc-action="download-svg" data-csc-el="downloadSvg" disabled>SVG</button>' +
    '      </div>' +
    '      <p class="csc-fineprint">Файл GLC формується у windows-1251 з CRLF. Дані нікуди не надсилаються — усе рахується у вашому браузері.</p>' +
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

  function escapeAttr(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function displayNumber(value, digits) {
    return core.formatNumber(value, digits === undefined ? 2 : digits);
  }

  function formatInput(value, digits) {
    if (value === null || value === undefined || value === "") return "";
    var n = core.parseNumber(value);
    if (n === null) return String(value);
    return core.formatNumber(n, typeof digits === "number" ? digits : 2);
  }

  function emptyRow() {
    return { d: "", s: "" };
  }

  function makeRows(count) {
    var rows = [];
    for (var i = 0; i < count; i += 1) rows.push(emptyRow());
    return rows;
  }

  function defaultState(root) {
    var unit = root.getAttribute("data-unit") || "mm";
    if (!core.UNIT_TO_MM[unit]) unit = "mm";
    var sigma = core.parseNumber(root.getAttribute("data-sigma"));
    var rows = parseInt(root.getAttribute("data-rows"), 10);
    if (!isFinite(rows) || rows < 2) rows = 6;
    if (rows > 100) rows = 100;
    return {
      version: 1,
      objectName: "",
      unit: unit,
      sigma: sigma === null ? 3 : sigma,
      mirror: false,
      showPoints: true,
      showRadii: true,
      showDims: false,
      imported: null,
      selection: { start: 0, end: 1 },
      origin: { mode: "corner", corner: 0, x: "", y: "" },
      rows: makeRows(rows),
      offsets: {}
    };
  }

  function validImported(obj) {
    if (!obj || !Array.isArray(obj.corners) || !Array.isArray(obj.edges)) return null;
    if (obj.corners.length < 3 || obj.edges.length < 3) return null;
    var corners = [];
    for (var c = 0; c < obj.corners.length; c += 1) {
      var p = obj.corners[c];
      if (!p || !isFinite(Number(p.x)) || !isFinite(Number(p.y))) return null;
      corners.push({ x: Number(p.x), y: Number(p.y) });
    }
    var edges = [];
    for (var i = 0; i < obj.edges.length; i += 1) {
      var edge = core.deserializeEdge(obj.edges[i]);
      if (!edge) return null;
      edges.push(edge);
    }
    return {
      roomName: typeof obj.roomName === "string" ? obj.roomName : "Ceiling_1",
      fileName: typeof obj.fileName === "string" ? obj.fileName : "",
      corners: corners,
      edges: edges.map(core.serializeEdge)
    };
  }

  function normalizeState(saved) {
    if (!saved || typeof saved !== "object" || !Array.isArray(saved.rows)) return null;
    var state = defaultState(document.createElement("div"));
    state.objectName = typeof saved.objectName === "string" ? saved.objectName : "";
    state.unit = core.UNIT_TO_MM[saved.unit] ? saved.unit : "mm";
    state.sigma = core.parseNumber(saved.sigma) === null ? 3 : core.parseNumber(saved.sigma);
    state.mirror = !!saved.mirror;
    state.showPoints = saved.showPoints !== false;
    state.showRadii = saved.showRadii !== false;
    state.showDims = !!saved.showDims;
    state.imported = validImported(saved.imported);
    var imported = state.imported;
    state.selection = {
      start: imported ? clamp(parseInt(saved.selection && saved.selection.start, 10) || 0, 0, imported.corners.length - 1) : 0,
      end: imported ? clamp(parseInt(saved.selection && saved.selection.end, 10) || 1, 0, imported.corners.length - 1) : 1
    };
    state.origin = {
      mode: saved.origin && saved.origin.mode === "point" ? "point" : "corner",
      corner: imported && saved.origin ? clamp(parseInt(saved.origin.corner, 10) || 0, 0, imported.corners.length - 1) : 0,
      x: saved.origin && saved.origin.x !== undefined ? String(saved.origin.x) : "",
      y: saved.origin && saved.origin.y !== undefined ? String(saved.origin.y) : ""
    };
    state.rows = [];
    saved.rows.forEach(function (row) {
      state.rows.push({
        d: row && row.d !== undefined && row.d !== null ? String(row.d) : "",
        s: row && row.s !== undefined && row.s !== null ? String(row.s) : ""
      });
    });
    if (state.rows.length === 0) state.rows = makeRows(6);
    state.offsets = {};
    if (saved.offsets && typeof saved.offsets === "object") {
      Object.keys(saved.offsets).forEach(function (key) {
        var off = saved.offsets[key];
        if (off && isFinite(Number(off.dx)) && isFinite(Number(off.dy))) {
          state.offsets[key] = {
            dx: clamp(Number(off.dx), -100000, 100000),
            dy: clamp(Number(off.dy), -100000, 100000)
          };
        }
      });
    }
    return state;
  }

  function initRoot(root, index) {
    if (!root.querySelector(".csc-app")) {
      root.insertAdjacentHTML("beforeend", TEMPLATE.replace("__CSC_HELP_IMAGES__", ""));
    }
    var els = {};
    root.querySelectorAll("[data-csc-el]").forEach(function (el) {
      els[el.getAttribute("data-csc-el")] = el;
    });
    if (!els.svg || !els.tbody) return;

    var storageKey = STORAGE_PREFIX + location.pathname + ":" + index;
    var state = loadState();
    var result = null;
    var importMessages = [];
    var timer = null;
    var view = null;
    var userView = false;
    var pointers = {};
    var gesture = null;
    var drag = null;
    var themeColors = readThemeColors(root);

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

    var saveTimer = null;
    function saveStateSoon() {
      if (drag) {
        if (saveTimer) window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(saveState, 250);
        return;
      }
      saveState();
    }

    function setMirror(value) {
      var next = !!value;
      if (state.mirror === next) return;
      state.mirror = next;
      // Manual nudges are stored in world coordinates; mirror them as well.
      Object.keys(state.offsets).forEach(function (key) {
        if (state.offsets[key]) state.offsets[key].dy = -state.offsets[key].dy;
      });
    }

    function schedule(immediate) {
      if (timer) window.clearTimeout(timer);
      if (immediate) {
        update();
      } else {
        timer = window.setTimeout(update, 150);
      }
    }

    function setElementText(el, text) {
      if (el) el.textContent = text;
    }

    function readThemeColors(node) {
      var style = window.getComputedStyle(node);
      function css(name, fallback) {
        var v = style.getPropertyValue(name);
        return v && v.trim() ? v.trim() : fallback;
      }
      return {
        text: css("--csc-text", "#1f2a24"),
        muted: css("--csc-muted", "#5e6c63"),
        line: css("--csc-line", "#d0d8d1"),
        accent: css("--csc-accent", "#2f6d4e"),
        accentSoft: css("--csc-accent-soft", "#edf7f1"),
        error: css("--csc-error", "#b42318"),
        warn: css("--csc-warn", "#b26d00"),
        wall: css("--csc-wall", "#b26d00"),
        bg: css("--csc-svg-bg", "#ffffff")
      };
    }

    function cornerLabel(corner, i) {
      return "P" + (i + 1) + " — " + Math.round(corner.x) + ", " + Math.round(corner.y);
    }

    function fillSelect(select, selected) {
      if (!select) return;
      select.textContent = "";
      if (!state.imported) {
        var opt = document.createElement("option");
        opt.value = "0";
        opt.textContent = "— спочатку завантажте .glc —";
        select.appendChild(opt);
        select.disabled = true;
        return;
      }
      select.disabled = false;
      state.imported.corners.forEach(function (corner, i) {
        var option = document.createElement("option");
        option.value = String(i);
        option.textContent = cornerLabel(corner, i);
        select.appendChild(option);
      });
      select.value = String(selected);
    }

    function syncSettings() {
      if (els.title) {
        var title = root.getAttribute("data-title");
        setElementText(els.title, title || "Калькулятор сегментів кривої стелі");
      }
      if (els.objectName) els.objectName.value = state.objectName;
      if (els.unit) els.unit.value = state.unit;
      if (els.sigma) els.sigma.value = formatInput(state.sigma);
      if (els.mirror) els.mirror.checked = state.mirror;
      if (els.showPoints) els.showPoints.checked = state.showPoints;
      if (els.showRadii) els.showRadii.checked = state.showRadii;
      if (els.showDims) els.showDims.checked = state.showDims;
      if (els.mirrorButton) {
        els.mirrorButton.setAttribute("aria-pressed", state.mirror ? "true" : "false");
      }
      if (els.originMode) els.originMode.value = state.origin.mode;
      if (els.originX) els.originX.value = state.origin.x;
      if (els.originY) els.originY.value = state.origin.y;
      if (els.originCornerField) els.originCornerField.hidden = state.origin.mode !== "corner";
      if (els.originXField) els.originXField.hidden = state.origin.mode !== "point";
      if (els.originYField) els.originYField.hidden = state.origin.mode !== "point";
      fillSelect(els.startCorner, state.selection.start);
      fillSelect(els.endCorner, state.selection.end);
      fillSelect(els.originCorner, state.origin.corner);
      if (els.importStatus) {
        els.importStatus.textContent = state.imported
          ? (state.imported.fileName ? state.imported.fileName + " · " : "") +
            state.imported.corners.length + " кутів, " + state.imported.edges.length + " сегментів"
          : "файл не завантажено";
      }
    }

    function renderTable() {
      var tbody = els.tbody;
      tbody.textContent = "";
      var frag = document.createDocumentFragment();
      state.rows.forEach(function (row, rowIndex) {
        var tr = document.createElement("tr");
        tr.setAttribute("data-row", String(rowIndex));
        if (rowIndex === state.rows.length - 1) {
          tr.classList.add("csc-row-end");
        }

        var tdNum = document.createElement("td");
        tdNum.className = "csc-num";
        tdNum.textContent = rowIndex === state.rows.length - 1 ? "E" : String(rowIndex + 1);
        if (rowIndex === state.rows.length - 1) tdNum.title = "Остання точка — кут E";
        tr.appendChild(tdNum);

        tr.appendChild(inputCell("d", row.d, rowIndex));
        tr.appendChild(inputCell("s", row.s, rowIndex));

        var tdStatus = document.createElement("td");
        tdStatus.className = "csc-status-cell";
        var badge = document.createElement("span");
        badge.className = "csc-badge";
        badge.setAttribute("data-status", String(rowIndex));
        badge.textContent = "—";
        tdStatus.appendChild(badge);
        tr.appendChild(tdStatus);

        var tdDel = document.createElement("td");
        tdDel.className = "csc-del-cell";
        var del = document.createElement("button");
        del.type = "button";
        del.className = "csc-icon-btn";
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
      input.className = "csc-cell-input";
      input.setAttribute("data-field", field);
      input.setAttribute("data-row", String(rowIndex));
      input.setAttribute(
        "aria-label",
        (field === "d" ? "Радіус від O" : "Довжина сегмента") + ", рядок " + (rowIndex + 1)
      );
      input.value = value;
      td.appendChild(input);
      return td;
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
      var sigma = core.parseNumber(els.sigma ? els.sigma.value : "");
      state.sigma = sigma === null || sigma <= 0 ? 3 : sigma;
      state.mirror = !!(els.mirror && els.mirror.checked);
      state.showPoints = !!(els.showPoints && els.showPoints.checked);
      state.showRadii = !!(els.showRadii && els.showRadii.checked);
      state.showDims = !!(els.showDims && els.showDims.checked);
      state.origin.mode = els.originMode && els.originMode.value === "point" ? "point" : "corner";
      state.selection.start = parseInt(els.startCorner ? els.startCorner.value : "0", 10) || 0;
      state.selection.end = parseInt(els.endCorner ? els.endCorner.value : "1", 10) || 0;
      state.origin.corner = parseInt(els.originCorner ? els.originCorner.value : "0", 10) || 0;
      state.origin.x = els.originX ? els.originX.value : "";
      state.origin.y = els.originY ? els.originY.value : "";
    }

    function activeRows() {
      var last = -1;
      state.rows.forEach(function (row, idx) {
        if (String(row.d || "").trim() || String(row.s || "").trim()) last = idx;
      });
      if (last < 0) return null;
      return state.rows.slice(0, last + 1);
    }

    function originPoint() {
      if (!state.imported) return null;
      if (state.origin.mode === "corner") {
        var corner = state.imported.corners[state.origin.corner];
        return corner ? { x: corner.x, y: corner.y } : null;
      }
      var x = core.toMm(state.origin.x, state.unit);
      var y = core.toMm(state.origin.y, state.unit);
      if (x === null || y === null) return null;
      return { x: x, y: y };
    }

    function baseEdges() {
      if (!state.imported) return [];
      var edges = [];
      state.imported.edges.forEach(function (serialized) {
        var edge = core.deserializeEdge(serialized);
        if (edge) edges.push(edge);
      });
      return edges;
    }

    function selectionInfo() {
      if (!state.imported) {
        return { ok: false, error: "Спочатку завантажте контур .glc." };
      }
      var n = state.imported.corners.length;
      var iS = state.selection.start;
      var iE = state.selection.end;
      if (!(iS >= 0 && iS < n) || !(iE >= 0 && iE < n)) {
        return { ok: false, error: "Некоректно вибрано кути S/E." };
      }
      if (iS === iE) {
        return { ok: false, error: "Кути S і E мають бути різними." };
      }
      return { ok: true, iS: iS, iE: iE };
    }

    function calculate() {
      if (!state.imported) return null;
      var sel = selectionInfo();
      if (!sel.ok) return { ok: false, errors: [sel.error], warnings: [] };

      var origin = originPoint();
      if (!origin) {
        return {
          ok: false,
          errors: ["Вкажіть точку O: кут контуру або коректні X,Y у вибраних одиницях."],
          warnings: []
        };
      }

      var rows = activeRows();
      if (!rows) return null;
      if (rows.length < 2) {
        return {
          ok: false,
          errors: ["Потрібно щонайменше два рядки: проміжна точка і кінець E."],
          warnings: []
        };
      }

      var rowsMm = rows.map(function (row) {
        return {
          d: core.toMm(row.d, state.unit),
          s: core.toMm(row.s, state.unit)
        };
      });

      var edges = baseEdges();
      var corners = state.imported.corners.map(function (p) { return { x: p.x, y: p.y }; });
      var S = corners[sel.iS];
      var E = corners[sel.iE];

      if (state.mirror) {
        var b = core.edgesBounds(edges);
        var sum = b.minY + b.maxY;
        function flip(p) { return { x: p.x, y: sum - p.y }; }
        edges = edges.map(function (edge) {
          if (edge.type === "arc") {
            return core.makeArcFromBulge(flip(edge.start), flip(edge.end), -edge.bulge);
          }
          return core.makeLine(flip(edge.start), flip(edge.end));
        });
        corners = corners.map(flip);
        S = flip(S);
        E = flip(E);
        origin = flip(origin);
      }

      var solved = core.solveChain({
        start: S,
        end: E,
        origin: origin,
        rows: rowsMm,
        sigma: state.sigma
      });
      if (!solved.ok) {
        return solved;
      }

      var adjusted = core.applyOffsets(solved.chain, state.offsets);
      var residuals = core.chainResiduals(adjusted, rowsMm, origin, state.sigma);

      var contour = core.assembleContour({
        edges: edges,
        startIndex: sel.iS,
        endIndex: sel.iE,
        chainPoints: adjusted
      });
      if (!contour.ok) {
        return contour;
      }

      var warnThreshold = Math.max(3 * state.sigma, 5);
      var warnings = solved.warnings
        .filter(function (message) { return message.indexOf("Рядок ") !== 0; })
        .concat(contour.warnings || []);
      for (var i = 0; i < solved.rows.length; i += 1) {
        if (residuals.rows[i]) {
          solved.rows[i].residualD = residuals.rows[i].residualD;
          solved.rows[i].residualS = residuals.rows[i].residualS;
          solved.rows[i].status = residuals.rows[i].status;
        }
        var parts = [];
        if (Math.abs(solved.rows[i].residualD) > warnThreshold) {
          parts.push("радіус Δ " + core.formatFixed(solved.rows[i].residualD, 1) + " мм");
        }
        if (Math.abs(solved.rows[i].residualS) > warnThreshold) {
          parts.push("сегмент Δ " + core.formatFixed(solved.rows[i].residualS, 1) + " мм");
        }
        (solved.rows[i].messages || []).forEach(function (message) {
          if (message.indexOf("радіус") !== 0 && message.indexOf("сегмент") !== 0) {
            parts.push(message);
          }
        });
        if (parts.length > 0) {
          warnings.push("Рядок " + (i + 1) + ": " + parts.join("; ") + ".");
        }
      }

      return {
        ok: true,
        errors: [],
        warnings: warnings,
        solved: solved,
        contour: contour,
        chain: adjusted,
        origin: origin,
        rowsMm: rowsMm,
        edges: edges,
        selection: sel,
        residuals: residuals
      };
    }

    function update() {
      readSettings();
      result = calculate();
      updateStatuses();
      updateMessages();
      updateResults();
      updateDownloads();
      renderPreview(false);
      saveStateSoon();
    }

    function updateStatuses() {
      root.querySelectorAll("[data-status]").forEach(function (badge) {
        var idx = parseInt(badge.getAttribute("data-status"), 10);
        var row = result && result.solved && result.solved.rows ? result.solved.rows[idx] : null;
        var tr = badge.closest("tr");
        if (tr) tr.classList.remove("csc-row-warn", "csc-row-error", "csc-row-ok");
        badge.className = "csc-badge";
        if (!row) {
          badge.textContent = "—";
          badge.title = "";
          return;
        }
        var worst = Math.max(Math.abs(row.residualD || 0), Math.abs(row.residualS || 0));
        var position = isFinite(row.sigmaPos) && row.sigmaPos > 0 ? " ±" + Math.round(row.sigmaPos) : "";
        if (row.status === "error") {
          badge.textContent = "✗ " + Math.round(worst);
          badge.classList.add("csc-badge-error");
          if (tr) tr.classList.add("csc-row-error");
        } else if (row.status === "warn") {
          badge.textContent = "⚠ " + Math.round(worst);
          badge.classList.add("csc-badge-warn");
          if (tr) tr.classList.add("csc-row-warn");
        } else {
          badge.textContent = "✓" + position;
          badge.classList.add("csc-badge-ok");
          if (tr) tr.classList.add("csc-row-ok");
        }
        var title = [];
        if (Math.abs(row.residualD || 0) > 0.05) {
          title.push("Δ радіуса: " + core.formatFixed(row.residualD, 1) + " мм");
        }
        if (Math.abs(row.residualS || 0) > 0.05) {
          title.push("Δ сегмента: " + core.formatFixed(row.residualS, 1) + " мм");
        }
        if (row.messages && row.messages.length) title.push(row.messages.join("; "));
        badge.title = title.join("\n");
      });
    }

    function updateMessages() {
      var box = els.messages;
      box.textContent = "";
      var all = [];
      importMessages.forEach(function (message) {
        all.push({ type: message.type || "error", text: message.text });
      });
      if (!state.imported) {
        all.push({ type: "info", text: "Завантажте .glc з Arkulator — і контур з’явиться на прев’ю." });
      } else if (!result) {
        all.push({ type: "info", text: "Заповніть радіуси d і сегменти s у таблиці." });
      } else if (!result.ok) {
        (result.errors || []).forEach(function (message) {
          all.push({ type: "error", text: message });
        });
      } else {
        (result.warnings || []).forEach(function (message) {
          all.push({ type: "warn", text: message });
        });
        if (!result.warnings.length) {
          all.push({ type: "info", text: "Контур побудовано. Можна завантажувати GLC." });
        }
      }
      all.forEach(function (item) {
        var div = document.createElement("div");
        div.className = "csc-msg csc-msg-" + (item.type === "info" ? "ok" : item.type);
        div.textContent = item.text;
        box.appendChild(div);
      });
    }

    function updateResults() {
      var stats = result && result.ok ? result.contour.stats : null;
      setElementText(els.rArea, stats ? displayNumber(stats.areaM2, 2) : "—");
      setElementText(els.rPerimeter, stats ? displayNumber(stats.perimeterM, 2) : "—");
      setElementText(els.rCurved, stats ? displayNumber(stats.curvedM, 2) : "—");
      setElementText(els.rEdges, stats ? stats.arcCount + " / " + stats.edgeCount : "—");
      setElementText(
        els.rResidual,
        result && result.ok
          ? "d " + core.formatFixed(result.residuals.maxAbsD, 1) + " · s " +
            core.formatFixed(result.residuals.maxAbsS, 1)
          : "—"
      );

      if (!state.imported) {
        setElementText(els.status, "Завантажте .glc, щоб почати.");
      } else if (!result) {
        setElementText(els.status, "Заповніть таблицю замірів.");
      } else if (!result.ok) {
        setElementText(els.status, "Побудова неможлива: виправте помилки.");
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

    function screenPoint(p) {
      return { x: p.x, y: -p.y };
    }

    function fitView() {
      var b = result && result.ok && result.contour
        ? result.contour.stats.bounds
        : { minX: -2500, minY: 0, maxX: 2500, maxY: 3000 };
      var screenW = Math.max(1, b.maxX - b.minX);
      var screenH = Math.max(1, b.maxY - b.minY);
      var margin = Math.max(150, Math.max(screenW, screenH) * 0.08);
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

    function svgText(x, y, text, attrs) {
      var el = svgEl("text", attrs || {});
      el.setAttribute("x", core.formatNumber(x, 2));
      el.setAttribute("y", core.formatNumber(y, 2));
      el.textContent = text;
      return el;
    }

    function contourPath(edges) {
      var d = "";
      edges.forEach(function (edge, edgeIndex) {
        var pts = core.sampleEdge(edge, 2);
        pts.forEach(function (p, i) {
          var sp = screenPoint(p);
          if (edgeIndex === 0 && i === 0) {
            d += "M " + core.formatNumber(sp.x, 2) + " " + core.formatNumber(sp.y, 2);
          } else if (i > 0 || edgeIndex > 0) {
            d += " L " + core.formatNumber(sp.x, 2) + " " + core.formatNumber(sp.y, 2);
          }
        });
      });
      return d + " Z";
    }

    function renderPreview(forceFit) {
      var svg = els.svg;
      svg.textContent = "";
      themeColors = readThemeColors(root);

      if (!result || !result.ok) {
        if (!view) {
          view = { x: -3000, y: -4000, w: 6000, h: 4500 };
          applyViewBox();
        }
        svg.appendChild(
          svgEl("rect", {
            x: view.x,
            y: view.y,
            width: view.w,
            height: view.h,
            fill: themeColors.bg
          })
        );
        svg.appendChild(
          svgText(
            view.x + view.w / 2,
            view.y + view.h / 2,
            state.imported
              ? "Заповніть таблицю замірів — контур з’явиться тут"
              : "Завантажте .glc з Arkulator",
            {
              "text-anchor": "middle",
              fill: themeColors.muted,
              "font-size": Math.max(22, view.w / 42),
              "font-family": "Segoe UI, Tahoma, sans-serif"
            }
          )
        );
        return;
      }

      if (forceFit || !view) {
        view = fitView();
        userView = false;
      } else if (!userView) {
        view = fitView();
      }
      applyViewBox();

      var b = result.contour.stats.bounds;
      var margin = Math.max(150, Math.max(b.maxX - b.minX, b.maxY - b.minY) * 0.1);
      svg.appendChild(
        svgEl("rect", {
          x: view.x - margin,
          y: view.y - margin,
          width: view.w + margin * 2,
          height: view.h + margin * 2,
          fill: themeColors.bg
        })
      );

      var fs = Math.max(16, view.w / 65);
      var small = fs * 0.72;
      var dotR = Math.max(4, view.w / 170);

      // Original side of the imported contour (for visual comparison).
      var original = [];
      var n = result.edges.length;
      for (var k = result.selection.iS; k < result.selection.iS + countReplaced(result.selection); k += 1) {
        original.push(result.edges[k % n]);
      }
      if (original.length) {
        svg.appendChild(
          svgEl("path", {
            d: contourPath(original).replace(/ Z$/, ""),
            fill: "none",
            stroke: themeColors.muted,
            "stroke-width": 2,
            "stroke-dasharray": "7 6",
            "stroke-opacity": "0.7",
            "vector-effect": "non-scaling-stroke"
          })
        );
      }

      // New contour.
      svg.appendChild(
        svgEl("path", {
          d: contourPath(result.contour.edges),
          fill: themeColors.accentSoft,
          "fill-opacity": "0.55",
          stroke: themeColors.accent,
          "stroke-width": 3,
          "stroke-linejoin": "round",
          "stroke-linecap": "round",
          "vector-effect": "non-scaling-stroke"
        })
      );

      // Highlight the reconstructed chain.
      if (result.contour.chainEdges && result.contour.chainEdges.length) {
        svg.appendChild(
          svgEl("path", {
            d: contourPath(result.contour.chainEdges).replace(/ Z$/, ""),
            fill: "none",
            stroke: themeColors.wall,
            "stroke-width": 4,
            "stroke-linejoin": "round",
            "stroke-linecap": "round",
            "vector-effect": "non-scaling-stroke"
          })
        );
      }

      var chain = result.chain || [];
      var origin = result.origin;

      // Radial measurement lines.
      if (state.showRadii && origin) {
        var op = screenPoint(origin);
        for (var r = 1; r < chain.length; r += 1) {
          var cp = screenPoint(chain[r]);
          svg.appendChild(
            svgEl("line", {
              x1: op.x,
              y1: op.y,
              x2: cp.x,
              y2: cp.y,
              stroke: themeColors.warn,
              "stroke-width": 1.2,
              "stroke-dasharray": "4 5",
              "stroke-opacity": "0.55",
              "vector-effect": "non-scaling-stroke"
            })
          );
        }
        svg.appendChild(
          svgEl("path", {
            d: "M " + core.formatNumber(op.x, 2) + " " + core.formatNumber(op.y - dotR * 1.6, 2) +
              " L " + core.formatNumber(op.x + dotR * 1.6, 2) + " " + core.formatNumber(op.y, 2) +
              " L " + core.formatNumber(op.x, 2) + " " + core.formatNumber(op.y + dotR * 1.6, 2) +
              " L " + core.formatNumber(op.x - dotR * 1.6, 2) + " " + core.formatNumber(op.y, 2) + " Z",
            fill: themeColors.wall,
            stroke: themeColors.bg,
            "stroke-width": 1.5,
            "vector-effect": "non-scaling-stroke"
          })
        );
        svg.appendChild(
          svgText(op.x + dotR * 2, op.y - dotR * 1.2, "O", {
            fill: themeColors.wall,
            "font-size": fs,
            "font-family": "Segoe UI, Tahoma, sans-serif",
            "font-weight": "600"
          })
        );
      }

      // Fixed corners S and E.
      if (result.contour.startCorner) {
        var sp = screenPoint(result.contour.startCorner);
        svg.appendChild(
          svgEl("rect", {
            x: sp.x - dotR,
            y: sp.y - dotR,
            width: dotR * 2,
            height: dotR * 2,
            fill: themeColors.accent,
            stroke: themeColors.bg,
            "stroke-width": 1.5,
            "vector-effect": "non-scaling-stroke"
          })
        );
        svg.appendChild(
          svgText(sp.x + dotR * 1.8, sp.y - dotR * 1.2, "S", {
            fill: themeColors.accent,
            "font-size": fs,
            "font-family": "Segoe UI, Tahoma, sans-serif",
            "font-weight": "600"
          })
        );
      }
      if (result.contour.endCorner) {
        var ep = screenPoint(result.contour.endCorner);
        svg.appendChild(
          svgEl("rect", {
            x: ep.x - dotR,
            y: ep.y - dotR,
            width: dotR * 2,
            height: dotR * 2,
            fill: themeColors.accent,
            stroke: themeColors.bg,
            "stroke-width": 1.5,
            "vector-effect": "non-scaling-stroke"
          })
        );
        svg.appendChild(
          svgText(ep.x + dotR * 1.8, ep.y - dotR * 1.2, "E", {
            fill: themeColors.accent,
            "font-size": fs,
            "font-family": "Segoe UI, Tahoma, sans-serif",
            "font-weight": "600"
          })
        );
      }

      // Joint points (draggable).
      if (state.showPoints && chain.length > 2) {
        for (var j = 1; j < chain.length - 1; j += 1) {
          var row = result.solved.rows[j - 1];
          var color = themeColors.accent;
          if (row && row.status === "warn") color = themeColors.warn;
          if (row && row.status === "error") color = themeColors.error;
          var jp = screenPoint(chain[j]);
          var circle = svgEl("circle", {
            cx: jp.x,
            cy: jp.y,
            r: dotR * 1.25,
            fill: color,
            stroke: themeColors.bg,
            "stroke-width": 1.5,
            "vector-effect": "non-scaling-stroke",
            "data-chain": String(j - 1),
            style: "cursor: move"
          });
          svg.appendChild(circle);
          svg.appendChild(
            svgText(jp.x + dotR * 1.7, jp.y + dotR * 2.4, String(j), {
              fill: color,
              "font-size": small,
              "font-family": "Segoe UI, Tahoma, sans-serif"
            })
          );
        }
      }

      // Dimensions.
      if (state.showDims) {
        for (var d = 1; d < chain.length; d += 1) {
          var mid = { x: (chain[d - 1].x + chain[d].x) / 2, y: (chain[d - 1].y + chain[d].y) / 2 };
          var mp = screenPoint(mid);
          var rowD = result.solved.rows[d - 1];
          svg.appendChild(
            svgText(mp.x + dotR, mp.y - dotR, core.formatNumber(rowD ? rowD.s : 0, 0), {
              fill: themeColors.muted,
              "font-size": small,
              "font-family": "Segoe UI, Tahoma, sans-serif"
            })
          );
        }
        result.contour.edges.forEach(function (edge) {
          if (edge.type !== "arc") return;
          var ap = screenPoint(edge.arcPoint);
          svg.appendChild(
            svgText(ap.x + dotR, ap.y - dotR,
              "R" + core.formatNumber(edge.radius, 0) + " / " + core.formatNumber(edge.length, 0), {
                fill: themeColors.muted,
                "font-size": small,
                "font-family": "Segoe UI, Tahoma, sans-serif"
              })
          );
        });
      }
    }

    function countReplaced(selection) {
      var n = state.imported.corners.length;
      var iS = selection.iS;
      var iE = selection.iE;
      return (iE > iS ? iE : iE + n) - iS;
    }

    /* ----------------------------- view gestures ----------------------- */

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
    var rafPending = false;

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
      var chainAttr = event.target && event.target.getAttribute
        ? event.target.getAttribute("data-chain")
        : null;
      if (chainAttr !== null && chainAttr !== undefined && result && result.ok) {
        var rowIndex = parseInt(chainAttr, 10);
        var existing = state.offsets[rowIndex] || { dx: 0, dy: 0 };
        drag = {
          row: rowIndex,
          startX: event.clientX,
          startY: event.clientY,
          offset: { dx: existing.dx || 0, dy: existing.dy || 0 }
        };
        els.svg.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }
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
      els.svg.classList.add("csc-dragging");
    }

    function onPointerMove(event) {
      if (drag) {
        if (!event.buttons) {
          drag = null;
          els.svg.classList.remove("csc-dragging");
          saveState();
          return;
        }
        var rect = els.svg.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1 || !view || view.w <= 0 || view.h <= 0) {
          drag = null;
          els.svg.classList.remove("csc-dragging");
          return;
        }
        var dx = ((event.clientX - drag.startX) / rect.width) * view.w;
        var dy = -((event.clientY - drag.startY) / rect.height) * view.h;
        var limit = 100000;
        state.offsets[drag.row] = {
          dx: clamp(drag.offset.dx + dx, -limit, limit),
          dy: clamp(drag.offset.dy + dy, -limit, limit)
        };
        if (!rafPending) {
          rafPending = true;
          window.requestAnimationFrame(function () {
            rafPending = false;
            update();
          });
        }
        event.preventDefault();
        return;
      }
      if (!pointers[event.pointerId] || !gesture || !view) return;
      pointers[event.pointerId] = { x: event.clientX, y: event.clientY };
      var ids = Object.keys(pointers);
      if (gesture.type === "pan" && ids.length === 1) {
        var rect2 = els.svg.getBoundingClientRect();
        if (rect2.width <= 0 || rect2.height <= 0) return;
        var dx2 = ((event.clientX - gesture.startX) / rect2.width) * gesture.view.w;
        var dy2 = ((event.clientY - gesture.startY) / rect2.height) * gesture.view.h;
        view.x = gesture.view.x - dx2;
        view.y = gesture.view.y - dy2;
        userView = true;
        applyViewBox();
      } else if (gesture.type === "pinch" && ids.length >= 2) {
        var p1 = pointers[ids[0]];
        var p2 = pointers[ids[1]];
        var dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        var center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        var rect3 = els.svg.getBoundingClientRect();
        var startUser = {
          x: gesture.view.x + ((gesture.startCenter.x - rect3.left) / rect3.width) * gesture.view.w,
          y: gesture.view.y + ((gesture.startCenter.y - rect3.top) / rect3.height) * gesture.view.h
        };
        var factor = gesture.startDist / Math.max(1, dist);
        var newW = clamp(gesture.view.w * factor, 50, 500000);
        var scale = newW / gesture.view.w;
        view.w = newW;
        view.h = gesture.view.h * scale;
        view.x = startUser.x - ((gesture.startCenter.x - rect3.left) / rect3.width) * view.w;
        view.y = startUser.y - ((gesture.startCenter.y - rect3.top) / rect3.height) * view.h;
        userView = true;
        applyViewBox();
      }
    }

    function onPointerUp(event) {
      if (drag) {
        drag = null;
        pointers = {};
        gesture = null;
        els.svg.classList.remove("csc-dragging");
        saveState();
        return;
      }
      delete pointers[event.pointerId];
      if (Object.keys(pointers).length === 0) {
        gesture = null;
        els.svg.classList.remove("csc-dragging");
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
      state.offsets = {};
      renderTable();
      schedule(true);
    }

    function removeRow(index) {
      if (state.rows.length <= 1) {
        state.rows[0] = emptyRow();
      } else {
        state.rows.splice(index, 1);
      }
      state.offsets = {};
      renderTable();
      schedule(true);
    }

    function clearAll() {
      var ok = window.confirm("Очистити всі заміри? Завантажений контур залишиться.");
      if (!ok) return;
      state.rows = makeRows(Math.max(6, state.rows.length));
      state.offsets = {};
      importMessages = [];
      renderTable();
      schedule(true);
    }

    function defaultSelection(corners) {
      var iS = 0;
      var iE = 1;
      var mid = {
        x: (corners[iS].x + corners[iE].x) / 2,
        y: (corners[iS].y + corners[iE].y) / 2
      };
      var origin = 0;
      var best = -1;
      corners.forEach(function (corner, idx) {
        var d = core.dist(corner, mid);
        if (d > best) {
          best = d;
          origin = idx;
        }
      });
      return { selection: { start: iS, end: iE }, origin: origin };
    }

    function useImported(parsed, fileName, messages) {
      state.imported = {
        roomName: parsed.roomName || "Ceiling_1",
        fileName: fileName || "",
        corners: parsed.corners.map(function (p) { return { x: p.x, y: p.y }; }),
        edges: parsed.edges.map(core.serializeEdge)
      };
      var defaults = defaultSelection(parsed.corners);
      state.selection = defaults.selection;
      state.origin = { mode: "corner", corner: defaults.origin, x: "", y: "" };
      state.rows = makeRows(6);
      state.offsets = {};
      importMessages = messages || [];
      syncSettings();
      renderTable();
      view = null;
      schedule(true);
    }

    function importGlcBytes(bytes, fileName) {
      try {
        var parsed = core.parseGlc(bytes);
        if (!parsed.ok) {
          importMessages = parsed.errors.map(function (message) {
            return { type: "error", text: (fileName ? fileName + ": " : "") + message };
          });
          updateMessages();
          return;
        }
        var messages = parsed.warnings.map(function (message) {
          return { type: "warn", text: message };
        });
        if (!state.objectName && parsed.roomName) {
          state.objectName = parsed.roomName;
          if (els.objectName) els.objectName.value = state.objectName;
        }
        useImported(parsed, fileName, messages);
      } catch (e) {
        importMessages = [{ type: "error", text: "Не вдалося прочитати .glc: " + (e.message || "помилка") }];
        updateMessages();
      }
    }

    function loadExample() {
      var demo = core.buildDemo();
      state.imported = {
        roomName: demo.roomName,
        fileName: "demo",
        corners: demo.corners.map(function (p) { return { x: p.x, y: p.y }; }),
        edges: demo.edges.slice()
      };
      state.objectName = demo.objectName;
      state.selection = demo.selection;
      state.origin = demo.origin;
      var scale = core.UNIT_TO_MM[state.unit] || 1;
      state.rows = demo.rows.map(function (row) {
        return {
          d: formatInput(row.d / scale, state.unit === "m" ? 3 : 1),
          s: formatInput(row.s / scale, state.unit === "m" ? 3 : 1)
        };
      });
      state.offsets = {};
      importMessages = [];
      syncSettings();
      renderTable();
      view = null;
      schedule(true);
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
      return core.slugFilename(
        state.objectName || (state.imported && state.imported.roomName),
        "segment-steli"
      );
    }

    function downloadGlc() {
      if (!result || !result.ok) return;
      var bytes = core.buildGlcBytes(result.contour, {
        roomName: state.objectName || (state.imported && state.imported.roomName) || "Ceiling_1"
      });
      downloadBlob(new Blob([bytes], { type: "application/octet-stream" }), baseName() + ".glc");
    }

    function downloadDxf() {
      if (!result || !result.ok) return;
      downloadBlob(
        new Blob([core.buildDxf(result.contour)], { type: "application/dxf;charset=utf-8" }),
        baseName() + ".dxf"
      );
    }

    function downloadSvg() {
      if (!result || !result.ok) return;
      var text = core.buildSvg(result.contour, {
        title: state.objectName,
        showPoints: state.showPoints,
        showDims: state.showDims
      });
      downloadBlob(
        new Blob([text], { type: "image/svg+xml;charset=utf-8" }),
        baseName() + ".svg"
      );
    }

    function downloadState() {
      var payload = JSON.stringify(state, null, 2);
      downloadBlob(
        new Blob([payload], { type: "application/json;charset=utf-8" }),
        baseName() + "-stan.json"
      );
    }

    function importStateText(text, fileName) {
      try {
        var restored = normalizeState(JSON.parse(text));
        if (!restored) {
          importMessages = [{ type: "error", text: "Файл стану пошкоджений або не містить потрібних полів." }];
          updateMessages();
          return;
        }
        state = restored;
        importMessages = [{ type: "info", text: "Стан завантажено: " + (fileName || "без імені") }];
        syncSettings();
        renderTable();
        view = null;
        schedule(true);
      } catch (e) {
        importMessages = [{ type: "error", text: "Не вдалося прочитати JSON: " + (e.message || "помилка") }];
        updateMessages();
      }
    }

    function changeUnit(newUnit) {
      if (!core.UNIT_TO_MM[newUnit] || newUnit === state.unit) return;
      var factor = (core.UNIT_TO_MM[state.unit] || 1) / (core.UNIT_TO_MM[newUnit] || 1);
      var digits = newUnit === "m" ? 3 : 1;
      function convert(value) {
        var n = core.parseNumber(value);
        return n === null ? value : formatInput(n * factor, digits);
      }
      state.rows.forEach(function (row) {
        row.d = convert(row.d);
        row.s = convert(row.s);
      });
      state.origin.x = convert(state.origin.x);
      state.origin.y = convert(state.origin.y);
      state.unit = newUnit;
      state.offsets = {};
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
      state.rows[rowIndex][field] = input.value;
      schedule(false);
    });

    els.tbody.addEventListener("keydown", function (event) {
      var input = event.target;
      if (!input || input.tagName !== "INPUT") return;
      if (event.key !== "Enter") return;
      event.preventDefault();
      var rowIndex = parseInt(input.getAttribute("data-row"), 10);
      var field = input.getAttribute("data-field");
      if (rowIndex === state.rows.length - 1) {
        state.rows.push(emptyRow());
        state.offsets = {};
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
      removeRow(parseInt(target.getAttribute("data-action-delete"), 10));
    });

    if (els.objectName) {
      els.objectName.addEventListener("input", function () {
        state.objectName = els.objectName.value;
        schedule(false);
      });
    }

    if (els.sigma) {
      els.sigma.addEventListener("input", function () {
        var n = core.parseNumber(els.sigma.value);
        state.sigma = n === null || n <= 0 ? 3 : n;
        schedule(false);
      });
    }

    if (els.unit) {
      els.unit.addEventListener("change", function () {
        changeUnit(els.unit.value);
      });
    }

    if (els.startCorner) {
      els.startCorner.addEventListener("change", function () {
        state.selection.start = parseInt(els.startCorner.value, 10) || 0;
        schedule(true);
      });
    }
    if (els.endCorner) {
      els.endCorner.addEventListener("change", function () {
        state.selection.end = parseInt(els.endCorner.value, 10) || 0;
        schedule(true);
      });
    }
    if (els.originCorner) {
      els.originCorner.addEventListener("change", function () {
        state.origin.corner = parseInt(els.originCorner.value, 10) || 0;
        schedule(true);
      });
    }
    if (els.originMode) {
      els.originMode.addEventListener("change", function () {
        state.origin.mode = els.originMode.value === "point" ? "point" : "corner";
        syncSettings();
        schedule(true);
      });
    }
    ["originX", "originY"].forEach(function (key) {
      if (!els[key]) return;
      els[key].addEventListener("input", function () {
        state.origin[key === "originX" ? "x" : "y"] = els[key].value;
        schedule(false);
      });
    });

    ["mirror", "showPoints", "showRadii", "showDims"].forEach(function (key) {
      if (!els[key]) return;
      els[key].addEventListener("change", function () {
        if (key === "mirror") {
          setMirror(els.mirror.checked);
          els.mirror.checked = state.mirror;
          if (els.mirrorButton) {
            els.mirrorButton.setAttribute("aria-pressed", state.mirror ? "true" : "false");
          }
          schedule(true);
          return;
        }
        state[key] = els[key].checked;
        schedule(key === "showPoints");
      });
    });

    root.addEventListener("click", function (event) {
      var target = event.target.closest ? event.target.closest("[data-csc-action]") : null;
      if (!target || !root.contains(target)) return;
      var action = target.getAttribute("data-csc-action");
      if (action === "add-row") addRows(1);
      else if (action === "add-5") addRows(5);
      else if (action === "clear") clearAll();
      else if (action === "example") loadExample();
      else if (action === "reset-offsets") {
        state.offsets = {};
        schedule(true);
      } else if (action === "save-json") downloadState();
      else if (action === "import-json") {
        if (els.jsonFile) els.jsonFile.click();
      } else if (action === "import-glc") {
        if (els.glcFile) els.glcFile.click();
      } else if (action === "mirror") {
        setMirror(!state.mirror);
        if (els.mirror) els.mirror.checked = state.mirror;
        if (els.mirrorButton) {
          els.mirrorButton.setAttribute("aria-pressed", state.mirror ? "true" : "false");
        }
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

    if (els.glcFile) {
      els.glcFile.addEventListener("change", function () {
        var file = els.glcFile.files && els.glcFile.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          importGlcBytes(new Uint8Array(reader.result), file.name);
          els.glcFile.value = "";
        };
        reader.onerror = function () {
          importMessages = [{ type: "error", text: "Не вдалося прочитати файл .glc." }];
          updateMessages();
        };
        reader.readAsArrayBuffer(file);
      });
    }

    if (els.jsonFile) {
      els.jsonFile.addEventListener("change", function () {
        var file = els.jsonFile.files && els.jsonFile.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          importStateText(String(reader.result || ""), file.name);
          els.jsonFile.value = "";
        };
        reader.onerror = function () {
          importMessages = [{ type: "error", text: "Не вдалося прочитати JSON-файл стану." }];
          updateMessages();
        };
        reader.readAsText(file, "utf-8");
      });
    }

    els.svg.addEventListener("wheel", onWheel, { passive: false });
    els.svg.addEventListener("pointerdown", onPointerDown);
    els.svg.addEventListener("pointermove", onPointerMove);
    els.svg.addEventListener("pointerup", onPointerUp);
    els.svg.addEventListener("pointercancel", onPointerUp);
    els.svg.addEventListener("lostpointercapture", function () {
      if (drag) {
        drag = null;
        els.svg.classList.remove("csc-dragging");
        saveState();
      }
    });

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
    var roots = document.querySelectorAll("[data-csc-root]");
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
    var themeClass = luminance < 0.42 ? "csc-theme-dark" : "csc-theme-light";
    roots.forEach(function (root) {
      root.classList.remove("csc-theme-dark", "csc-theme-light");
      root.classList.add(themeClass);
    });
  }

  function initAll() {
    detectSiteTheme();
    document.querySelectorAll("[data-csc-root]").forEach(function (root, index) {
      initRoot(root, index);
    });
  }

  ready(initAll);
})();
