<div id="dxf-glc-converter" class="app">
    <section class="panel controls">
        <h2>DXF to GLC Converter</h2>
        <label class="field">
            <span>DXF file</span>
            <input type="file" id="dxfFile" accept=".dxf,text/plain">
        </label>
        <label class="field">
            <span>Unit override</span>
            <select id="unitOverride">
                <option value="auto">Auto (from $INSUNITS)</option>
                <option value="mm">mm</option>
                <option value="cm">cm</option>
                <option value="m">m</option>
            </select>
        </label>
        <div class="actions">
            <button id="convertBtn" type="button">Convert</button>
            <button id="downloadBtn" type="button" disabled>Download GLC</button>
        </div>
        <div id="stats" class="stats">No file loaded.</div>
        <div id="errorPanel" class="error-panel"></div>
        <pre id="debugLog" class="debug-log"></pre>
    </section>

    <section class="panel preview">
        <h2>SVG Preview</h2>
        <div class="svg-wrap">
            <svg id="previewSvg" xmlns="http://www.w3.org/2000/svg" aria-label="Geometry preview"></svg>
        </div>
    </section>
</div>