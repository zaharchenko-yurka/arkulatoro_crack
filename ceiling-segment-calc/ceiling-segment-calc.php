<?php
/**
 * Plugin Name: Ceiling Segment Calculator
 * Description: Калькулятор сегментів кривої стелі: контур .glc з Arkulator + заміри радіусів і сегментів → новий контур → файл .glc. Працює повністю у браузері.
 * Version: 1.0.0
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Author: Ceiling Tools
 * Text Domain: ceiling-segment-calc
 */

if (!defined('ABSPATH')) {
    exit;
}

define('CSC_PLUGIN_VERSION', '1.0.0');
define('CSC_PLUGIN_URL', plugin_dir_url(__FILE__));
define('CSC_PLUGIN_PATH', plugin_dir_path(__FILE__));

/**
 * Asset version based on filemtime so browsers pick up changes immediately.
 *
 * @param string $relative Relative path inside the plugin.
 * @return string
 */
function csc_asset_version($relative)
{
    $path = CSC_PLUGIN_PATH . ltrim($relative, '/');
    if (file_exists($path)) {
        $mtime = filemtime($path);
        if ($mtime) {
            return (string) $mtime;
        }
    }
    return CSC_PLUGIN_VERSION;
}

/**
 * Register assets. They are enqueued only when the shortcode is present.
 */
function csc_register_assets()
{
    wp_register_style(
        'csc-style',
        CSC_PLUGIN_URL . 'assets/csc.css',
        array(),
        csc_asset_version('assets/csc.css')
    );

    wp_register_script(
        'csc-core',
        CSC_PLUGIN_URL . 'assets/csc-core.js',
        array(),
        csc_asset_version('assets/csc-core.js'),
        true
    );

    wp_register_script(
        'csc-ui',
        CSC_PLUGIN_URL . 'assets/csc-ui.js',
        array('csc-core'),
        csc_asset_version('assets/csc-ui.js'),
        true
    );
}
add_action('wp_enqueue_scripts', 'csc_register_assets');

/**
 * Whether the current singular post contains the shortcode.
 *
 * @return bool
 */
function csc_current_post_has_shortcode()
{
    if (is_admin()) {
        return false;
    }

    $post = get_post();

    if ($post instanceof WP_Post && has_shortcode($post->post_content, 'ceiling_segment')) {
        return true;
    }

    return false;
}

/**
 * Enqueue assets before the header is printed when the shortcode is detected.
 */
function csc_maybe_enqueue_assets()
{
    if (csc_current_post_has_shortcode()) {
        csc_enqueue_assets();
    }
}
add_action('wp_enqueue_scripts', 'csc_maybe_enqueue_assets', 20);

/**
 * Enqueue all three assets (idempotent).
 */
function csc_enqueue_assets()
{
    wp_enqueue_style('csc-style');
    wp_enqueue_script('csc-core');
    wp_enqueue_script('csc-ui');
}

/**
 * [ceiling_segment] shortcode.
 *
 * @param array $atts Shortcode attributes.
 * @return string
 */
function csc_shortcode($atts)
{
    $atts = shortcode_atts(
        array(
            'unit'  => 'mm',
            'rows'  => 6,
            'sigma' => 3,
            'title' => 'Калькулятор сегментів кривої стелі',
        ),
        $atts,
        'ceiling_segment'
    );

    $unit = strtolower(trim((string) $atts['unit']));
    if (!in_array($unit, array('mm', 'cm', 'm'), true)) {
        $unit = 'mm';
    }

    $rows = (int) $atts['rows'];
    if ($rows < 1) {
        $rows = 1;
    }
    if ($rows > 100) {
        $rows = 100;
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
        $title = 'Калькулятор сегментів кривої стелі';
    }

    // Covers dynamically rendered shortcodes (widgets, page builders) too.
    csc_enqueue_assets();

    $attributes = array(
        'class'        => 'csc-root',
        'data-csc-root' => '1',
        'data-unit'    => $unit,
        'data-rows'    => (string) $rows,
        'data-sigma'   => (string) $sigma,
        'data-title'   => $title,
    );

    $attr_html = '';
    foreach ($attributes as $name => $value) {
        $attr_html .= ' ' . $name . '="' . esc_attr($value) . '"';
    }

    $noscript = '<noscript><div class="csc-panel"><p class="csc-msg csc-msg-error">'
        . 'Для роботи калькулятора потрібно увімкнути JavaScript у браузері.'
        . '</p></div></noscript>';

    return '<div' . $attr_html . '>' . $noscript . '</div>';
}
add_shortcode('ceiling_segment', 'csc_shortcode');
