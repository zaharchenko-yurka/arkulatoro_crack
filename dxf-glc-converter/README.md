# DXF to GLC Converter

## Project Description

WordPress плагин для конвертирования файлов DXF в формат GLC (Arkulator). Конвертер работает в браузере и позволяет пользователям загружать DXF файлы, просматривать их как SVG и экспортировать в GLC формат для открытия в приложении Arkulator.

### Key Features
- Загрузка DXF файлов через веб-интерфейс
- SVG превью геометрии
- Автоматическое определение единиц измерения из DXF ($INSUNITS)
- Ручное переопределение единиц (mm, cm, m)
- Экспорт в GLC формат
- Подробное логирование ошибок и предупреждений

## Technical Stack

- **Backend**: WordPress PHP плагин
- **Frontend**: Vanilla JavaScript (ES6 modules)
- **DXF Parser**: Custom DXF parser (dxfParser.js)
- **Geometry**: Custom contour builder (contourBuilder.js)
- **Export**: Custom GLC builder (glcBuilder.js)
- **Preview**: SVG renderer (svgRenderer.js)

## Project Structure

```
dxf-glc-converter/
├── dxf-glc-converter.php    # Main plugin file with WordPress hooks
├── converter-ui.php          # UI template (shortcode output)
├── README.md                 # This file
├── assets/
│   ├── style.css            # UI styling
│   └── js/
│       ├── app.js           # Main application logic
│       ├── dxfParser.js      # DXF format parser
│       ├── contourBuilder.js # Geometry contour building
│       ├── svgRenderer.js    # SVG preview rendering
│       ├── glcBuilder.js     # GLC export builder
│       └── unitConverter.js  # Unit conversion utilities
└── index.html               # Standalone version (not used in WordPress)
```

## Current Status ✓

### Completed Features
- ✓ WordPress plugin integration
- ✓ ES6 module loading with proper `type="module"` attributes
- ✓ DXF file parsing (basic functionality)
- ✓ Contour detection and closed polygon identification
- ✓ SVG preview rendering
- ✓ GLC file export
- ✓ Unit conversion (mm, cm, m)
- ✓ Error and warning logging
- ✓ UI with file input, unit override, and download button

### Known Limitations ⚠️

**Current working scope:**
- ✓ Accepts DXF files with **closed contours only**
- ✓ Ignores text entities (letters written as lines)
- ✓ Only processes line segments in closed shapes

**Current issues:**
- ✗ Cannot process open contours (detects them but rejects export)
- ✗ Cannot process text/letters (written as line entities)
- ✗ Cannot connect close-by vertices (snapping disabled)
- ✗ DXF must be valid and properly formatted

## Roadmap - Future Improvements 🔜

### High Priority
1. **Ignore open contours and letters**
   - Skip open chains during contour building
   - Filter out text entities before processing
   - Only export valid closed contours
   - Status: Planned

2. **Vertex snapping / Point merging**
   - Implement proximity threshold (default: 1mm)
   - Snap close vertices together during parsing
   - Closes gaps in imperfectly drawn shapes
   - Status: Planned

3. **Better DXF handling**
   - Support more DXF entity types
   - Better error messages for unsupported formats
   - Warn about ignored entities
   - Status: Planned

### Medium Priority
4. **Parser robustness**
   - Handle malformed DXF files gracefully
   - Better support for different DXF versions
   - Binary DXF support (currently ASCII only)
   - Status: Not started

5. **UI Improvements**
   - Progress bar for large files
   - Multiple file batch processing
   - Show which contours are open vs closed
   - Visual highlighting of closed contours
   - Status: Not started

6. **Performance**
   - Optimize for large DXF files (1000+ entities)
   - Worker threads for parsing
   - Status: Not started

## Usage

### As WordPress Plugin
1. Upload plugin folder to `wp-content/plugins/`
2. Activate in WordPress admin
3. Add shortcode to page: `[dxf_glc_converter]`

### Standalone (Development)
Open `index.html` in a modern browser with ES6 module support.

## How to Test

### Success Case
1. Create a simple DXF with closed rectangle/polygon
2. Ensure vertices are properly connected
3. Upload to converter
4. See "Contours: 1" in stats
5. Click "Convert" and "Download GLC"
6. Open in Arkulator - should show geometry correctly

### Current Limitation
- Upload any DXF with open lines or text
- Parser will show: "Contours: 0" and "Open contours detected"
- This is expected behavior until improvements are implemented

## Code Notes for AI Agents

### Key Files to Modify for Improvements

**dxfParser.js**
- Entry point: `parseDXF()` function
- Currently requires valid ASCII DXF
- Extracts entities and coordinates
- TODO: Add entity type filtering (skip text/mtext)

**contourBuilder.js**
- Entry point: `buildContours()` function
- Builds graph from line segments
- Detects closed vs open chains
- TODO: Add vertex snapping logic here
- TODO: Option to ignore/skip open chains

**app.js**
- Main controller and state management
- Handles file upload, conversion flow
- TODO: Add configuration for snapping threshold
- TODO: Update UI to show what was ignored

### Architecture Notes
- All modules use ES6 import/export
- Must be loaded with `type="module"` in script tags
- WordPress plugin uses `script_loader_tag` filter to add module attribute
- SVG preview updates during conversion process
- GLC export uses binary format (glcBuilder.js handles encoding)

## Installation Notes

### Requirements
- WordPress 5.0+
- Modern browser with ES6 module support
- PHP 7.4+

### Known WordPress Integration Issues
- Requires `type="module"` attribute on script tags (handled by plugin)
- Other plugins may have console errors but don't affect converter
- Elementor Pro compatibility: Some unrelated errors may appear

## License

[Add license info if applicable]

## Contributors

Initial development and debugging completed.
