<?php
/**
 * Plugin Name: DXF to GLC Converter
 */

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
