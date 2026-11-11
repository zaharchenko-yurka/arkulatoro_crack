<?php
/**
 * Minimal WordPress stub harness to exercise the plugin without a live WP.
 * Run: php tests/php-shortcode-test.php
 */

error_reporting(E_ALL);
ini_set('display_errors', '1');

define('ABSPATH', __DIR__ . '/');

$GLOBALS['ccc_test'] = array(
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
    return 'https://example.test/wp-content/plugins/ceiling-contour-calc/';
}

function plugin_dir_path($file)
{
    return dirname($file) . '/';
}

function add_action($hook, $callback, $priority = 10, $accepted_args = 1)
{
    $GLOBALS['ccc_test']['actions'][$hook][] = array($callback, $priority);
}

function add_filter($hook, $callback, $priority = 10, $accepted_args = 1)
{
    $GLOBALS['ccc_test']['actions'][$hook][] = array($callback, $priority);
}

function add_shortcode($tag, $callback)
{
    $GLOBALS['ccc_test']['shortcodes'][$tag] = $callback;
}

function wp_register_style($handle, $src = '', $deps = array(), $ver = false)
{
    $GLOBALS['ccc_test']['styles'][$handle] = array('src' => $src, 'deps' => $deps, 'ver' => $ver, 'enqueued' => false);
}

function wp_register_script($handle, $src = '', $deps = array(), $ver = false, $footer = false)
{
    $GLOBALS['ccc_test']['scripts'][$handle] = array('src' => $src, 'deps' => $deps, 'ver' => $ver, 'footer' => $footer, 'enqueued' => false);
}

function wp_enqueue_style($handle)
{
    if (!isset($GLOBALS['ccc_test']['styles'][$handle])) {
        throw new RuntimeException('Unknown style: ' . $handle);
    }
    $GLOBALS['ccc_test']['styles'][$handle]['enqueued'] = true;
}

function wp_enqueue_script($handle)
{
    if (!isset($GLOBALS['ccc_test']['scripts'][$handle])) {
        throw new RuntimeException('Unknown script: ' . $handle);
    }
    $GLOBALS['ccc_test']['scripts'][$handle]['enqueued'] = true;
}

function is_admin()
{
    return false;
}

function get_post()
{
    $post = new WP_Post();
    $post->post_content = $GLOBALS['ccc_test']['has_shortcode_content'];
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

require __DIR__ . '/../ceiling-contour-calc.php';

/**
 * Minimal do_action() that executes the registered callbacks in priority order.
 * Asset registration/detection hooks fire during the real wp_enqueue_scripts run.
 */
function ccc_test_do_action($hook)
{
    if (empty($GLOBALS['ccc_test']['actions'][$hook])) {
        return;
    }
    $callbacks = $GLOBALS['ccc_test']['actions'][$hook];
    usort($callbacks, function ($a, $b) {
        return $a[1] <=> $b[1];
    });
    foreach ($callbacks as $entry) {
        call_user_func($entry[0]);
    }
}

ccc_test_do_action('wp_enqueue_scripts');

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

check(isset($GLOBALS['ccc_test']['shortcodes']['ceiling_contour']), 'shortcode [ceiling_contour] is registered');
check(isset($GLOBALS['ccc_test']['scripts']['ccc-core']), 'ccc-core.js is registered');
check(isset($GLOBALS['ccc_test']['scripts']['ccc-ui']), 'ccc-ui.js is registered');
check(isset($GLOBALS['ccc_test']['styles']['ccc-style']), 'ccc.css is registered');
check(
    $GLOBALS['ccc_test']['scripts']['ccc-ui']['deps'] === array('ccc-core'),
    'ccc-ui depends on ccc-core'
);
check(
    $GLOBALS['ccc_test']['scripts']['ccc-core']['footer'] === true
        && $GLOBALS['ccc_test']['scripts']['ccc-ui']['footer'] === true,
    'scripts load in the footer'
);
check(
    $GLOBALS['ccc_test']['scripts']['ccc-core']['ver'] !== false
        && $GLOBALS['ccc_test']['scripts']['ccc-core']['ver'] !== CCC_PLUGIN_VERSION,
    'asset version uses filemtime'
);

// No shortcode on the page: assets must not be enqueued by the detection hook.
$GLOBALS['ccc_test']['has_shortcode_content'] = '<p>Звичайна сторінка</p>';
ccc_maybe_enqueue_assets();
check(
    !$GLOBALS['ccc_test']['scripts']['ccc-core']['enqueued']
        && !$GLOBALS['ccc_test']['styles']['ccc-style']['enqueued'],
    'assets are not enqueued without the shortcode'
);

// Shortcode present: detection hook must enqueue.
$GLOBALS['ccc_test']['has_shortcode_content'] = '<p>[ceiling_contour]</p>';
ccc_maybe_enqueue_assets();
check(
    $GLOBALS['ccc_test']['scripts']['ccc-core']['enqueued']
        && $GLOBALS['ccc_test']['scripts']['ccc-ui']['enqueued']
        && $GLOBALS['ccc_test']['styles']['ccc-style']['enqueued'],
    'assets are enqueued when the shortcode is present'
);

$callback = $GLOBALS['ccc_test']['shortcodes']['ceiling_contour'];

$html = $callback(array());
check(strpos($html, 'data-ccc-root') !== false, 'shortcode outputs the root container');
check(strpos($html, 'class="ccc-root"') !== false, 'root uses its own ccc- prefix');
check(strpos($html, 'data-unit="cm"') !== false, 'default unit is cm');
check(strpos($html, 'data-rows="12"') !== false, 'default rows = 12');
check(
    strpos($html, 'data-img1="https://example.test/wp-content/plugins/ceiling-contour-calc/assets/pamyatka_zamiry_1z2.jpg"') !== false,
    'instruction image 1 URL is passed from PHP'
);
check(
    strpos($html, 'data-img2="https://example.test/wp-content/plugins/ceiling-contour-calc/assets/pamyatka_zamiry_2z2.jpg"') !== false,
    'instruction image 2 URL is passed from PHP'
);
check(strpos($html, '<noscript>') !== false, 'noscript fallback is present');
check(strpos($html, 'JavaScript') !== false, 'noscript message is in Ukrainian');

$html = $callback(array('unit' => 'M', 'rows' => '5', 'tol' => '4,5', 'sigma' => '2', 'title' => 'Вітальня <b>'));
check(strpos($html, 'data-unit="m"') !== false, 'unit attribute is whitelisted and lowercased');
check(strpos($html, 'data-rows="5"') !== false, 'rows attribute is applied');
check(strpos($html, 'data-tol="4.5"') !== false, 'tol accepts a decimal comma');
check(strpos($html, 'data-sigma="2"') !== false, 'sigma attribute is applied');
check(strpos($html, 'data-title="Вітальня <b>"') === false, 'title is sanitized (tags stripped)');
check(strpos($html, '&lt;b&gt;') === false, 'sanitized title contains no markup');

$html = $callback(array('unit' => 'inch', 'rows' => '-9', 'tol' => 'abc', 'sigma' => '0'));
check(strpos($html, 'data-unit="cm"') !== false, 'invalid unit falls back to cm');
check(strpos($html, 'data-rows="1"') !== false, 'rows is clamped to >= 1');
check(strpos($html, 'data-tol="3"') !== false, 'invalid tol falls back to 3');
check(strpos($html, 'data-sigma="3"') !== false, 'non-positive sigma falls back to 3');

$html = $callback(array('rows' => '100000'));
check(strpos($html, 'data-rows="100"') !== false, 'rows is clamped to <= 100');

$html = $callback(array('title' => ''));
check(strpos($html, 'data-title="Калькулятор контуру стелі"') !== false, 'empty title falls back to the default');

$html = $callback(array('title' => 'A "quoted" <script>alert(1)</script>'));
check(strpos($html, '<script>') === false, 'no script tag can be injected through the title');
check(strpos($html, '&quot;') !== false, 'quotes in the title are escaped');

echo "\nPHP checks: " . $checks . ", failures: " . $failures . "\n";
exit($failures === 0 ? 0 : 1);