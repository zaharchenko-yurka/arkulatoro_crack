<?php
/**
 * Minimal WordPress stub harness to exercise the plugin without a live WP.
 * Run: php tests/php-shortcode-test.php
 */

error_reporting(E_ALL);
ini_set('display_errors', '1');

define('ABSPATH', __DIR__ . '/');

$GLOBALS['csc_test'] = array(
    'scripts' => array(),
    'styles' => array(),
    'shortcodes' => array(),
    'actions' => array(),
    'has_shortcode_content' => '',
);

class WP_Post
{
    public $post_content = '';
}

function plugin_dir_url($file)
{
    return 'https://example.test/wp-content/plugins/ceiling-segment-calc/';
}

function plugin_dir_path($file)
{
    return dirname($file) . '/';
}

function add_action($hook, $callback, $priority = 10, $accepted_args = 1)
{
    $GLOBALS['csc_test']['actions'][$hook][] = array($callback, $priority);
}

function add_filter($hook, $callback, $priority = 10, $accepted_args = 1)
{
    $GLOBALS['csc_test']['actions'][$hook][] = array($callback, $priority);
}

function add_shortcode($tag, $callback)
{
    $GLOBALS['csc_test']['shortcodes'][$tag] = $callback;
}

function wp_register_style($handle, $src = '', $deps = array(), $ver = false)
{
    $GLOBALS['csc_test']['styles'][$handle] = array('src' => $src, 'deps' => $deps, 'ver' => $ver, 'enqueued' => false);
}

function wp_register_script($handle, $src = '', $deps = array(), $ver = false, $footer = false)
{
    $GLOBALS['csc_test']['scripts'][$handle] = array('src' => $src, 'deps' => $deps, 'ver' => $ver, 'footer' => $footer, 'enqueued' => false);
}

function wp_enqueue_style($handle)
{
    if (!isset($GLOBALS['csc_test']['styles'][$handle])) {
        throw new RuntimeException('Unknown style: ' . $handle);
    }
    $GLOBALS['csc_test']['styles'][$handle]['enqueued'] = true;
}

function wp_enqueue_script($handle)
{
    if (!isset($GLOBALS['csc_test']['scripts'][$handle])) {
        throw new RuntimeException('Unknown script: ' . $handle);
    }
    $GLOBALS['csc_test']['scripts'][$handle]['enqueued'] = true;
}

function is_admin()
{
    return false;
}

function get_post()
{
    $post = new WP_Post();
    $post->post_content = $GLOBALS['csc_test']['has_shortcode_content'];
    return $post;
}

function has_shortcode($content, $tag)
{
    return strpos($content, '[' . $tag) !== false;
}

function shortcode_atts($pairs, $atts, $shortcode = '')
{
    $atts = (array) $atts;
    $out = array();
    foreach ($pairs as $name => $default) {
        if (array_key_exists($name, $atts)) {
            $out[$name] = $atts[$name];
        } else {
            $out[$name] = $default;
        }
    }
    return $out;
}

function sanitize_text_field($str)
{
    $str = strip_tags((string) $str);
    $str = preg_replace('/[\r\n\t ]+/', ' ', $str);
    return trim($str);
}

function esc_attr($text)
{
    return htmlspecialchars((string) $text, ENT_QUOTES, 'UTF-8');
}

function esc_html($text)
{
    return htmlspecialchars((string) $text, ENT_QUOTES, 'UTF-8');
}

require __DIR__ . '/../ceiling-segment-calc.php';

/**
 * Minimal do_action() that executes the registered callbacks in priority order.
 */
function csc_test_do_action($hook)
{
    if (empty($GLOBALS['csc_test']['actions'][$hook])) {
        return;
    }
    $callbacks = $GLOBALS['csc_test']['actions'][$hook];
    usort($callbacks, function ($a, $b) {
        return $a[1] <=> $b[1];
    });
    foreach ($callbacks as $entry) {
        call_user_func($entry[0]);
    }
}

csc_test_do_action('wp_enqueue_scripts');

$failures = 0;
$checks = 0;

function check($condition, $label)
{
    global $failures, $checks;
    $checks++;
    if ($condition) {
        echo "  ok   " . $label . "\n";
        return;
    }
    $failures++;
    echo "  FAIL " . $label . "\n";
}

echo "PHP plugin checks\n";

check(isset($GLOBALS['csc_test']['shortcodes']['ceiling_segment']), 'shortcode [ceiling_segment] is registered');
check(isset($GLOBALS['csc_test']['scripts']['csc-core']), 'csc-core.js is registered');
check(isset($GLOBALS['csc_test']['scripts']['csc-ui']), 'csc-ui.js is registered');
check(isset($GLOBALS['csc_test']['styles']['csc-style']), 'csc.css is registered');
check(
    $GLOBALS['csc_test']['scripts']['csc-ui']['deps'] === array('csc-core'),
    'csc-ui depends on csc-core'
);
check(
    $GLOBALS['csc_test']['scripts']['csc-core']['footer'] === true
        && $GLOBALS['csc_test']['scripts']['csc-ui']['footer'] === true,
    'scripts load in the footer'
);
check(
    $GLOBALS['csc_test']['scripts']['csc-core']['ver'] !== false
        && $GLOBALS['csc_test']['scripts']['csc-core']['ver'] !== CSC_PLUGIN_VERSION,
    'asset version uses filemtime'
);

// No shortcode on the page: assets must not be enqueued by the detection hook.
$GLOBALS['csc_test']['has_shortcode_content'] = '<p>Звичайна сторінка</p>';
csc_maybe_enqueue_assets();
check(
    !$GLOBALS['csc_test']['scripts']['csc-core']['enqueued']
        && !$GLOBALS['csc_test']['styles']['csc-style']['enqueued'],
    'assets are not enqueued without the shortcode'
);

// Shortcode present: detection hook must enqueue.
$GLOBALS['csc_test']['has_shortcode_content'] = '<p>[ceiling_segment]</p>';
csc_maybe_enqueue_assets();
check(
    $GLOBALS['csc_test']['scripts']['csc-core']['enqueued']
        && $GLOBALS['csc_test']['scripts']['csc-ui']['enqueued']
        && $GLOBALS['csc_test']['styles']['csc-style']['enqueued'],
    'assets are enqueued when the shortcode is present'
);

$callback = $GLOBALS['csc_test']['shortcodes']['ceiling_segment'];

$html = $callback(array());
check(strpos($html, 'data-csc-root') !== false, 'shortcode outputs the root container');
check(strpos($html, 'class="csc-root"') !== false, 'root uses its own csc- prefix');
check(strpos($html, 'data-unit="mm"') !== false, 'default unit is mm');
check(strpos($html, 'data-rows="6"') !== false, 'default rows = 6');
check(strpos($html, 'data-sigma="3"') !== false, 'default sigma = 3');
check(strpos($html, '<noscript>') !== false, 'noscript fallback is present');
check(strpos($html, 'JavaScript') !== false, 'noscript message is in Ukrainian');

$html = $callback(array('unit' => 'M', 'rows' => '12', 'sigma' => '2', 'title' => 'Вітальня <b>'));
check(strpos($html, 'data-unit="m"') !== false, 'unit attribute is whitelisted and lowercased');
check(strpos($html, 'data-rows="12"') !== false, 'rows attribute is applied');
check(strpos($html, 'data-sigma="2"') !== false, 'sigma attribute is applied');
check(strpos($html, 'data-title="Вітальня <b>"') === false, 'title is sanitized (tags stripped)');
check(strpos($html, '&lt;b&gt;') === false, 'sanitized title contains no markup');

$html = $callback(array('unit' => 'inch', 'rows' => '-9', 'sigma' => '0'));
check(strpos($html, 'data-unit="mm"') !== false, 'invalid unit falls back to mm');
check(strpos($html, 'data-rows="1"') !== false, 'rows is clamped to >= 1');
check(strpos($html, 'data-sigma="3"') !== false, 'non-positive sigma falls back to 3');

$html = $callback(array('rows' => '100000'));
check(strpos($html, 'data-rows="100"') !== false, 'rows is clamped to <= 100');

$html = $callback(array('title' => ''));
check(strpos($html, 'data-title="Калькулятор сегментів кривої стелі"') !== false, 'empty title falls back to the default');

$html = $callback(array('title' => 'A "quoted" <script>alert(1)</script>'));
check(strpos($html, '<script>') === false, 'no script tag can be injected through the title');
check(strpos($html, '&quot;') !== false, 'quotes in the title are escaped');

echo "\nPHP checks: " . $checks . ", failures: " . $failures . "\n";
exit($failures === 0 ? 0 : 1);
