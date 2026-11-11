<?php
/**
 * Plugin Name: Ceiling Contour Calculator
 * Description: Калькулятор контуру стелі: заміри рулеткою → контур → файл GLC для Arkulator. Працює повністю у браузері.
 * Version: 1.0.0
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Author: Ceiling Tools
 * Text Domain: ceiling-contour-calc
 */

if (!defined('ABSPATH')) {
    exit;
}

define('CCC_PLUGIN_VERSION', '1.0.0');
define('CCC_PLUGIN_URL', plugin_dir_url(__FILE__));
define('CCC_PLUGIN_PATH', plugin_dir_path(__FILE__));

/**
 * Asset version based on filemtime so browsers pick up changes immediately.
 *
 * @param string $relative Relative path inside the plugin.
 * @return string
 */
function ccc_asset_version($relative)
{
    $path = CCC_PLUGIN_PATH . ltrim($relative, '/');
    if (file_exists($path)) {
        $mtime = filemtime($path);
        if ($mtime) {
            return (string) $mtime;
        }
    }
    return CCC_PLUGIN_VERSION;
}

/**
 * Register assets. They are enqueued only when the shortcode is present.
 */
function ccc_register_assets()
{
    wp_register_style(
        'ccc-style',
        CCC_PLUGIN_URL . 'assets/ccc.css',
        array(),
        ccc_asset_version('assets/ccc.css')
    );

    wp_register_script(
        'ccc-core',
        CCC_PLUGIN_URL . 'assets/ccc-core.js',
        array(),
        ccc_asset_version('assets/ccc-core.js'),
        true
    );

    wp_register_script(
        'ccc-ui',
        CCC_PLUGIN_URL . 'assets/ccc-ui.js',
        array('ccc-core'),
        ccc_asset_version('assets/ccc-ui.js'),
        true
    );
}
add_action('wp_enqueue_scripts', 'ccc_register_assets');

/**
 * Whether the current singular post contains the shortcode.
 *
 * @return bool
 */
function ccc_current_post_has_shortcode()
{
    if (is_admin()) {
        return false;
    }

    $post = get_post();

    if ($post instanceof WP_Post && has_shortcode($post->post_content, 'ceiling_contour')) {
        return true;
    }

    return false;
}

/**
 * Enqueue assets before the header is printed when the shortcode is detected.
 */
function ccc_maybe_enqueue_assets()
{
    if (ccc_current_post_has_shortcode()) {
        ccc_enqueue_assets();
    }
}
add_action('wp_enqueue_scripts', 'ccc_maybe_enqueue_assets', 20);

/**
 * Enqueue all three assets (idempotent).
 */
function ccc_enqueue_assets()
{
    wp_enqueue_style('ccc-style');
    wp_enqueue_script('ccc-core');
    wp_enqueue_script('ccc-ui');
}

/**
 * [ceiling_contour] shortcode.
 *
 * @param array $atts Shortcode attributes.
 * @return string
 */
function ccc_shortcode($atts)
{
    $atts = shortcode_atts(
        array(
            'unit'  => 'cm',
            'rows'  => 12,
            'tol'   => 3,
            'sigma' => 3,
            'title' => 'Калькулятор контуру стелі',
        ),
        $atts,
        'ceiling_contour'
    );

    $unit = strtolower(trim((string) $atts['unit']));
    if (!in_array($unit, array('mm', 'cm', 'm'), true)) {
        $unit = 'cm';
    }

    $rows = (int) $atts['rows'];
    if ($rows < 1) {
        $rows = 1;
    }
    if ($rows > 100) {
        $rows = 100;
    }

    $tol_raw = str_replace(',', '.', trim((string) $atts['tol']));
    $tol = is_numeric($tol_raw) ? (float) $tol_raw : 3.0;
    if (!is_finite($tol) || $tol < 0) {
        $tol = 3;
    }
    if ($tol > 100) {
        $tol = 100;
    }

    $sigma_raw = str_replace(',', '.', trim((string) $atts['sigma']));
    $sigma = is_numeric($sigma_raw) ? (float) $sigma_raw : 3.0;
    if (!is_finite($sigma) || $sigma <= 0) {
        $sigma = 3;
    }
    if ($sigma > 100) {
        $sigma = 100;
    }

    $title = sanitize_text_field((string) $atts['title']);
    if ($title === '') {
        $title = 'Калькулятор контуру стелі';
    }

    // Covers dynamically rendered shortcodes (widgets, page builders) too.
    ccc_enqueue_assets();

    $attributes = array(
        'class'          => 'ccc-root',
        'data-ccc-root'  => '1',
        'data-unit'      => $unit,
        'data-rows'      => (string) $rows,
        'data-tol'       => (string) $tol,
        'data-sigma'     => (string) $sigma,
        'data-title'     => $title,
    );

    $attr_html = '';
    foreach ($attributes as $name => $value) {
        $attr_html .= ' ' . $name . '="' . esc_attr($value) . '"';
    }

    $noscript = '<noscript><div class="ccc-panel"><p class="ccc-msg ccc-msg-error">'
        . 'Для роботи калькулятора потрібно увімкнути JavaScript у браузері.'
        . '</p></div></noscript>';

    return '<div' . $attr_html . '>' . $noscript . '</div>';
}
add_shortcode('ceiling_contour', 'ccc_shortcode');
