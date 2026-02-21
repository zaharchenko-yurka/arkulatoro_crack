<?php
/**
 * Plugin Name: DXF to GLC Converter
 */

if (!defined('ABSPATH')) {
    exit;
}

/*function dxf_glc_enqueue_assets() {
    wp_enqueue_style('dxf-glc-style', plugin_dir_url(__FILE__) . 'style.css');
    wp_enqueue_script('dxf-glc-script', plugin_dir_url(__FILE__) . 'app.js', [], false, true);
}
add_action('wp_enqueue_scripts', 'dxf_glc_enqueue_assets');*/

function dxf_glc_enqueue_assets() {

    $base = plugin_dir_url(__FILE__) . 'assets/';
    $base_path = plugin_dir_path(__FILE__) . 'assets/';

    $style_ver = file_exists($base_path . 'style.css') ? filemtime($base_path . 'style.css') : false;
    $unit_ver = file_exists($base_path . 'js/unitConverter.js') ? filemtime($base_path . 'js/unitConverter.js') : false;
    $parser_ver = file_exists($base_path . 'js/dxfParser.js') ? filemtime($base_path . 'js/dxfParser.js') : false;
    $contour_ver = file_exists($base_path . 'js/contourBuilder.js') ? filemtime($base_path . 'js/contourBuilder.js') : false;
    $svg_ver = file_exists($base_path . 'js/svgRenderer.js') ? filemtime($base_path . 'js/svgRenderer.js') : false;
    $glc_ver = file_exists($base_path . 'js/glcBuilder.js') ? filemtime($base_path . 'js/glcBuilder.js') : false;
    $app_ver = file_exists($base_path . 'js/app.js') ? filemtime($base_path . 'js/app.js') : false;

    wp_enqueue_style(
        'dxf-glc-style',
        $base . 'style.css',
        [],
        $style_ver
    );

    wp_enqueue_script(
        'unit-converter',
        $base . 'js/unitConverter.js',
        [],
        $unit_ver,
        true
    );

    wp_enqueue_script(
        'dxf-parser',
        $base . 'js/dxfParser.js',
        [],
        $parser_ver,
        true
    );

    wp_enqueue_script(
        'contour-builder',
        $base . 'js/contourBuilder.js',
        [],
        $contour_ver,
        true
    );

    wp_enqueue_script(
        'svg-renderer',
        $base . 'js/svgRenderer.js',
        [],
        $svg_ver,
        true
    );

    wp_enqueue_script(
        'glc-builder',
        $base . 'js/glcBuilder.js',
        [],
        $glc_ver,
        true
    );

    wp_enqueue_script(
        'dxf-glc-app',
        $base . 'js/app.js',
        [
            'unit-converter',
            'dxf-parser',
            'contour-builder',
            'svg-renderer',
            'glc-builder'
        ],
        $app_ver,
        true
    );

    wp_localize_script(
        'dxf-glc-app',
        'dxfGlcConfig',
        [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('dxf_glc_validate_file'),
            'maxUploadSize' => wp_max_upload_size()
        ]
    );
}
add_action('wp_enqueue_scripts', 'dxf_glc_enqueue_assets');

function dxf_glc_script_type_module($tag, $handle) {
    $module_handles = [
        'unit-converter',
        'dxf-parser',
        'contour-builder',
        'svg-renderer',
        'glc-builder',
        'dxf-glc-app'
    ];
    
    if (in_array($handle, $module_handles)) {
        return str_replace(' src=', ' type="module" src=', $tag);
    }
    
    return $tag;
}
add_filter('script_loader_tag', 'dxf_glc_script_type_module', 10, 2);

function dxf_glc_shortcode() {
    ob_start();
    include plugin_dir_path(__FILE__) . 'converter-ui.php';
    return ob_get_clean();
}
add_shortcode('dxf_glc_converter', 'dxf_glc_shortcode');

function dxf_glc_sanitize_filename($filename) {
    $filename = wp_basename($filename);
    $filename = wp_check_invalid_utf8($filename);
    $filename = str_replace(['\\', '/'], '', $filename);
    $filename = preg_replace('/[\x00-\x1F\x7F]/u', '', $filename);
    $filename = trim($filename);

    $extension = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
    $base_name = pathinfo($filename, PATHINFO_FILENAME);

    $base_name = sanitize_text_field($base_name);
    $base_name = preg_replace('/[^\p{L}\p{N}\-_. ]/u', '', $base_name);
    $base_name = trim($base_name, " .\t\n\r\0\x0B");

    if ($base_name === '') {
        $base_name = 'converted';
    }

    return [
        'safe_file' => $base_name . ($extension !== '' ? '.' . $extension : ''),
        'base_name' => $base_name
    ];
}

function dxf_glc_validate_file_upload() {
    check_ajax_referer('dxf_glc_validate_file');

    if (!isset($_FILES['dxf_file']) || !is_array($_FILES['dxf_file'])) {
        wp_send_json_error(['message' => __('File was not uploaded.', 'dxf-glc-converter')], 400);
    }

    $file = $_FILES['dxf_file'];

    if (!empty($file['error'])) {
        wp_send_json_error(['message' => __('Upload failed.', 'dxf-glc-converter')], 400);
    }

    if (empty($file['name']) || empty($file['tmp_name'])) {
        wp_send_json_error(['message' => __('Invalid file payload.', 'dxf-glc-converter')], 400);
    }

    $sanitized = dxf_glc_sanitize_filename(wp_unslash($file['name']));
    $safe_file = $sanitized['safe_file'];
    $base_name = $sanitized['base_name'];
    $extension = strtolower(pathinfo($safe_file, PATHINFO_EXTENSION));

    if ($extension !== 'dxf') {
        wp_send_json_error(['message' => __('Only .dxf files are allowed.', 'dxf-glc-converter')], 400);
    }

    if (preg_match('/\.(php[0-9]?|phtml|phar|cgi|pl|py|jsp|asp|aspx|exe|bat|cmd|com|sh|ps1)(\.|$)/i', strtolower($safe_file))) {
        wp_send_json_error(['message' => __('Executable files are not allowed.', 'dxf-glc-converter')], 400);
    }

    $max_upload_size = wp_max_upload_size();
    $file_size = isset($file['size']) ? (int) $file['size'] : 0;

    if ($max_upload_size > 0 && $file_size > $max_upload_size) {
        wp_send_json_error(['message' => __('File is too large.', 'dxf-glc-converter')], 400);
    }

    $allowed_mime_types = [
        'text/plain',
        'application/dxf',
        'application/x-dxf',
        'image/vnd.dxf',
        'application/octet-stream'
    ];

    $detected_mime = '';
    if (function_exists('finfo_open')) {
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $detected_mime = $finfo ? finfo_file($finfo, $file['tmp_name']) : '';
        if ($finfo) {
            finfo_close($finfo);
        }
    }

    $wp_filetype = wp_check_filetype_and_ext(
        $file['tmp_name'],
        $safe_file,
        ['dxf' => 'text/plain']
    );

    $mime_allowed = in_array($detected_mime, $allowed_mime_types, true);
    $wp_ext_ok = isset($wp_filetype['ext']) && $wp_filetype['ext'] === 'dxf';

    if (!$mime_allowed && !$wp_ext_ok) {
        wp_send_json_error(['message' => __('Invalid DXF MIME type.', 'dxf-glc-converter')], 400);
    }

    wp_send_json_success(
        [
            'base_name' => $base_name,
            'safe_file' => $safe_file,
            'mime' => $detected_mime
        ]
    );
}
add_action('wp_ajax_dxf_glc_validate_file_upload', 'dxf_glc_validate_file_upload');
add_action('wp_ajax_nopriv_dxf_glc_validate_file_upload', 'dxf_glc_validate_file_upload');
