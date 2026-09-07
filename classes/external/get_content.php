<?php
// This file is part of Moodle - https://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <https://www.gnu.org/licenses/>.

/**
 * External function returning a readable activity's text content as a list of
 * structured blocks, so the client can render it on a native 3D panel inside a
 * VR headset (where the page DOM is not visible).
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\external;

use core_external\external_api;
use core_external\external_function_parameters;
use core_external\external_multiple_structure;
use core_external\external_single_structure;
use core_external\external_value;
use context_module;
use format_mnemo\output\scene;

/**
 * Return a readable activity (page, book chapter, or the intro of a quiz or
 * assignment) as a flat list of layout blocks - headings, paragraphs, list
 * items and images - with inline links preserved. The client lays these out on
 * a 3D reader panel so a learner can read the activity without leaving an
 * immersive session. Access is checked exactly as viewing the module would be,
 * and only content the user may already see is returned.
 */
class get_content extends external_api {
    /** @var int Hard cap on the number of blocks returned, to bound payloads. */
    const MAX_BLOCKS = 4000;

    /** @var int Hard cap on a single block's characters. */
    const MAX_TEXT = 20000;

    /**
     * Parameters.
     *
     * @return external_function_parameters
     */
    public static function execute_parameters(): external_function_parameters {
        return new external_function_parameters([
            'cmid' => new external_value(PARAM_INT, 'Course-module id'),
            'chapterid' => new external_value(PARAM_INT, 'Book chapter id (0 for the first)', VALUE_DEFAULT, 0),
        ]);
    }

    /**
     * Fetch and structure the activity's readable content.
     *
     * @param int $cmid Course-module id.
     * @param int $chapterid Book chapter id, or 0 for the first chapter.
     * @return array The structured content.
     */
    public static function execute(int $cmid, int $chapterid = 0): array {
        global $DB;

        $params = self::validate_parameters(
            self::execute_parameters(),
            ['cmid' => $cmid, 'chapterid' => $chapterid]
        );

        [$course, $cm] = get_course_and_cm_from_cmid($params['cmid']);
        require_login($course, false, $cm);
        $context = context_module::instance($cm->id);
        self::validate_context($context);

        // Login and $cm->uservisible cover availability and course visibility,
        // but not the module's own view capability (a custom role may lack it).
        // Since the body is read from the table directly rather than through the
        // module's view page, enforce that capability here so no protected
        // content is exposed to a user who could not view it.
        $viewcaps = [
            'page' => 'mod/page:view',
            'book' => 'mod/book:read',
            'quiz' => 'mod/quiz:view',
            'assign' => 'mod/assign:view',
        ];
        if (isset($viewcaps[$cm->modname])) {
            require_capability($viewcaps[$cm->modname], $context);
        }

        $result = [
            'cmid' => (int)$cm->id,
            'modname' => $cm->modname,
            'title' => format_string($cm->get_formatted_name(), true, ['context' => $context]),
            'readable' => scene::is_readable($cm->modname),
            'blocks' => [],
            'chapters' => [],
            'chapterid' => 0,
        ];

        // An activity the user cannot fully access (a restriction still in
        // force) exposes no body; the client keeps it locked.
        if (!$cm->uservisible || !$result['readable']) {
            return $result;
        }

        $html = '';
        if ($cm->modname === 'book') {
            $html = self::book_content($DB, $cm, $context, (int)$params['chapterid'], $result);
        } else {
            $html = self::module_content($DB, $cm, $context);
        }

        $result['blocks'] = self::parse_blocks((string)$html);
        return $result;
    }

    /**
     * The readable HTML for a single-body module (page content, or the intro of
     * a quiz or assignment), with pluginfile URLs rewritten to absolute so the
     * client can fetch inline images.
     *
     * @param \moodle_database $db The database.
     * @param \cm_info $cm The course module.
     * @param context_module $context The module context.
     * @return string The formatted HTML.
     */
    protected static function module_content($db, \cm_info $cm, context_module $context): string {
        // Each supported module keeps its body in a known table column and file
        // area; read the row directly so no per-module library is required.
        $sources = [
            'page' => ['table' => 'page', 'field' => 'content', 'format' => 'contentformat',
                'component' => 'mod_page', 'filearea' => 'content', 'itemid' => 0],
            'quiz' => ['table' => 'quiz', 'field' => 'intro', 'format' => 'introformat',
                'component' => 'mod_quiz', 'filearea' => 'intro', 'itemid' => 0],
            'assign' => ['table' => 'assign', 'field' => 'intro', 'format' => 'introformat',
                'component' => 'mod_assign', 'filearea' => 'intro', 'itemid' => 0],
        ];
        if (!isset($sources[$cm->modname])) {
            return '';
        }
        $s = $sources[$cm->modname];
        $row = $db->get_record($s['table'], ['id' => $cm->instance], '*', IGNORE_MISSING);
        if (!$row || !isset($row->{$s['field']})) {
            return '';
        }
        // An assignment can withhold its description until submissions open
        // (alwaysshowdescription off and a future allowsubmissionsfromdate).
        // Mirror that release rule so the intro is not exposed early.
        if (
            $cm->modname === 'assign' && empty($row->alwaysshowdescription) &&
                !empty($row->allowsubmissionsfromdate) && time() < $row->allowsubmissionsfromdate
        ) {
            return '';
        }
        return self::format_body(
            $row->{$s['field']},
            (int)($row->{$s['format']} ?? FORMAT_HTML),
            $context,
            $s['component'],
            $s['filearea'],
            $s['itemid']
        );
    }

    /**
     * The readable HTML for a book: its (visible) chapter list plus the chosen
     * chapter's body. Populates the chapter navigation on the result.
     *
     * @param \moodle_database $db The database.
     * @param \cm_info $cm The course module.
     * @param context_module $context The module context.
     * @param int $chapterid The requested chapter id, or 0 for the first.
     * @param array $result The result array to populate (chapters, chapterid).
     * @return string The chapter's formatted HTML.
     */
    protected static function book_content(
        $db,
        \cm_info $cm,
        context_module $context,
        int $chapterid,
        array &$result
    ): string {
        $chapters = $db->get_records(
            'book_chapters',
            ['bookid' => $cm->instance, 'hidden' => 0],
            'pagenum ASC',
            'id, title, subchapter, pagenum'
        );
        if (!$chapters) {
            return '';
        }
        $nav = [];
        foreach ($chapters as $chapter) {
            $nav[] = [
                'id' => (int)$chapter->id,
                'title' => format_string($chapter->title, true, ['context' => $context]),
                'subchapter' => !empty($chapter->subchapter),
            ];
        }
        $result['chapters'] = $nav;

        // Fall back to the first chapter when none (or an unknown one) is asked.
        $current = ($chapterid && isset($chapters[$chapterid])) ? $chapters[$chapterid] : reset($chapters);
        $result['chapterid'] = (int)$current->id;

        $row = $db->get_record('book_chapters', ['id' => $current->id], '*', IGNORE_MISSING);
        if (!$row) {
            return '';
        }
        return self::format_body(
            $row->content,
            (int)($row->contentformat ?? FORMAT_HTML),
            $context,
            'mod_book',
            'chapter',
            (int)$current->id
        );
    }

    /**
     * Rewrite pluginfile URLs to absolute and run the text through the standard
     * formatter (filters, cleaning), so the parsed blocks carry safe text and
     * fetchable image URLs.
     *
     * @param string $text The raw stored body.
     * @param int $format The body's text format.
     * @param context_module $context The module context.
     * @param string $component The file component.
     * @param string $filearea The file area.
     * @param int $itemid The file item id.
     * @return string The formatted HTML.
     */
    protected static function format_body(
        string $text,
        int $format,
        context_module $context,
        string $component,
        string $filearea,
        int $itemid
    ): string {
        $text = file_rewrite_pluginfile_urls(
            $text,
            'pluginfile.php',
            $context->id,
            $component,
            $filearea,
            $itemid
        );
        return format_text($text, $format, ['context' => $context, 'noclean' => false, 'para' => false]);
    }

    /**
     * Parse formatted HTML into a flat list of layout blocks the client can
     * render: headings, paragraphs (with inline link runs), list items and
     * images. Unknown containers are descended into; anything else contributes
     * its text as a paragraph.
     *
     * @param string $html The formatted HTML.
     * @return array The list of block arrays.
     */
    protected static function parse_blocks(string $html): array {
        $blocks = [];
        $html = trim($html);
        if ($html === '') {
            return $blocks;
        }
        $doc = new \DOMDocument();
        $previous = libxml_use_internal_errors(true);
        // The XML encoding hint keeps multibyte text intact; the wrapper gives a
        // single known root to walk.
        $doc->loadHTML(
            '<?xml encoding="utf-8"?><div id="mnemo-root">' . $html . '</div>',
            LIBXML_NOERROR | LIBXML_NONET
        );
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        $root = $doc->getElementById('mnemo-root');
        if ($root) {
            self::walk($root, $blocks);
        }
        return $blocks;
    }

    /**
     * Walk a node's children, emitting a block per block-level element and
     * descending into containers. Bounded by MAX_BLOCKS.
     *
     * @param \DOMNode $node The parent node.
     * @param array $blocks The block list, appended to by reference.
     */
    protected static function walk(\DOMNode $node, array &$blocks): void {
        foreach ($node->childNodes as $child) {
            if (count($blocks) >= self::MAX_BLOCKS) {
                return;
            }
            if ($child->nodeType === XML_TEXT_NODE) {
                $text = self::clean(($child->textContent ?? ''));
                if ($text !== '') {
                    $blocks[] = ['type' => 'para', 'runs' => [['text' => $text]]];
                }
                continue;
            }
            if ($child->nodeType !== XML_ELEMENT_NODE) {
                continue;
            }
            self::emit_element($child, $blocks);
        }
    }

    /**
     * Emit the block(s) for one element.
     *
     * @param \DOMElement $el The element.
     * @param array $blocks The block list, appended to by reference.
     */
    protected static function emit_element(\DOMElement $el, array &$blocks): void {
        $tag = strtolower($el->nodeName);
        if (preg_match('/^h([1-6])$/', $tag, $m)) {
            $text = self::clean($el->textContent ?? '');
            if ($text !== '') {
                $blocks[] = ['type' => 'heading', 'level' => (int)$m[1], 'text' => $text];
            }
            return;
        }
        switch ($tag) {
            case 'p':
            case 'blockquote':
                $runs = self::inline_runs($el);
                if ($runs) {
                    $blocks[] = ['type' => 'para', 'runs' => $runs, 'quote' => $tag === 'blockquote'];
                }
                self::emit_images($el, $blocks);
                break;
            case 'pre':
                $text = self::truncate((string)($el->textContent ?? ''));
                if (trim($text) !== '') {
                    $blocks[] = ['type' => 'para', 'runs' => [['text' => $text]], 'pre' => true];
                }
                break;
            case 'ul':
            case 'ol':
                self::emit_list($el, $tag === 'ol', $blocks);
                break;
            case 'img':
                self::emit_image($el, $blocks);
                break;
            case 'figure':
                self::emit_images($el, $blocks);
                $caption = self::clean($el->textContent ?? '');
                if ($caption !== '') {
                    $blocks[] = ['type' => 'para', 'runs' => [['text' => $caption]], 'caption' => true];
                }
                break;
            case 'br':
            case 'hr':
            case 'script':
            case 'style':
                break;
            default:
                // A container (div, section, article, span, table cell, ...):
                // descend so its block-level children are emitted in order.
                self::walk($el, $blocks);
                break;
        }
    }

    /**
     * Emit a list's items as listitem blocks, flattening a nested list into its
     * own items after the item that contains it (inline_runs stops at nested
     * lists, so their text is not folded into the parent).
     *
     * @param \DOMElement $list The ul/ol element.
     * @param bool $ordered Whether it is an ordered list.
     * @param array $blocks The block list, appended to by reference.
     */
    protected static function emit_list(\DOMElement $list, bool $ordered, array &$blocks): void {
        $index = 0;
        foreach ($list->childNodes as $li) {
            if (count($blocks) >= self::MAX_BLOCKS) {
                return;
            }
            if ($li->nodeType !== XML_ELEMENT_NODE || strtolower($li->nodeName) !== 'li') {
                continue;
            }
            $index++;
            $runs = self::inline_runs($li);
            if ($runs) {
                $blocks[] = ['type' => 'listitem', 'ordered' => $ordered, 'index' => $index, 'runs' => $runs];
            }
            self::emit_images($li, $blocks);
            // Flatten any list nested inside this item into its own items.
            foreach ($li->childNodes as $child) {
                if ($child->nodeType === XML_ELEMENT_NODE) {
                    $childtag = strtolower($child->nodeName);
                    if ($childtag === 'ul' || $childtag === 'ol') {
                        self::emit_list($child, $childtag === 'ol', $blocks);
                    }
                }
            }
        }
    }

    /**
     * Emit an image block for an <img>, resolving its absolute source.
     *
     * @param \DOMElement $img The img element.
     * @param array $blocks The block list, appended to by reference.
     */
    protected static function emit_image(\DOMElement $img, array &$blocks): void {
        $src = trim((string)$img->getAttribute('src'));
        if ($src === '' || strpos($src, 'data:') === 0) {
            // Skip data URIs (already inline, and potentially huge) and empties.
            return;
        }
        $block = ['type' => 'image', 'src' => $src, 'alt' => self::clean($img->getAttribute('alt'))];
        $w = (int)$img->getAttribute('width');
        $h = (int)$img->getAttribute('height');
        if ($w > 0) {
            $block['width'] = $w;
        }
        if ($h > 0) {
            $block['height'] = $h;
        }
        $blocks[] = $block;
    }

    /**
     * Emit image blocks for every <img> descendant of an element, so an image
     * inside a paragraph or list item still appears (after its text).
     *
     * @param \DOMElement $el The element to scan.
     * @param array $blocks The block list, appended to by reference.
     */
    protected static function emit_images(\DOMElement $el, array &$blocks): void {
        $imgs = $el->getElementsByTagName('img');
        foreach ($imgs as $img) {
            if (count($blocks) >= self::MAX_BLOCKS) {
                return;
            }
            self::emit_image($img, $blocks);
        }
    }

    /**
     * Collect an element's inline text as runs, marking runs that fall inside a
     * link with their href so the client can distinguish them. Adjacent runs
     * with the same href are merged and whitespace is collapsed.
     *
     * @param \DOMElement $el The element.
     * @return array The list of {text, href?} runs (empty when only whitespace).
     */
    protected static function inline_runs(\DOMElement $el): array {
        $runs = [];
        self::collect_runs($el, null, $runs);
        // Merge adjacent runs sharing an href, then drop empties.
        $merged = [];
        foreach ($runs as $run) {
            $last = count($merged) ? $merged[count($merged) - 1] : null;
            if ($last !== null && ($last['href'] ?? null) === ($run['href'] ?? null)) {
                $merged[count($merged) - 1]['text'] .= $run['text'];
            } else {
                $merged[] = $run;
            }
        }
        $out = [];
        $total = 0;
        foreach ($merged as $run) {
            $text = self::clean($run['text']);
            if ($text === '') {
                continue;
            }
            // Count Unicode characters, not bytes, so multibyte text is not
            // dropped far below the documented character cap; truncate the run
            // that crosses the cap rather than discarding it.
            $len = \core_text::strlen($text);
            if ($total + $len > self::MAX_TEXT) {
                $text = \core_text::substr($text, 0, max(0, self::MAX_TEXT - $total));
            }
            $total += $len;
            if ($text === '') {
                break;
            }
            $entry = ['text' => $text];
            if (!empty($run['href'])) {
                $entry['href'] = $run['href'];
            }
            $out[] = $entry;
        }
        return $out;
    }

    /**
     * Recursively gather text runs under a node, tracking the nearest ancestor
     * link's href. Line breaks become spaces; images are handled separately.
     *
     * @param \DOMNode $node The node.
     * @param string|null $href The current link href, or null.
     * @param array $runs The run list, appended to by reference.
     */
    protected static function collect_runs(\DOMNode $node, ?string $href, array &$runs): void {
        foreach ($node->childNodes as $child) {
            if ($child->nodeType === XML_TEXT_NODE) {
                $runs[] = ['text' => (string)$child->textContent, 'href' => $href];
                continue;
            }
            if ($child->nodeType !== XML_ELEMENT_NODE) {
                continue;
            }
            $tag = strtolower($child->nodeName);
            if ($tag === 'br') {
                $runs[] = ['text' => ' ', 'href' => $href];
                continue;
            }
            if ($tag === 'img' || $tag === 'script' || $tag === 'style') {
                continue;
            }
            if ($tag === 'ul' || $tag === 'ol') {
                // A nested list is a block boundary, not inline text: leave it
                // for emit_list to flatten into its own items.
                continue;
            }
            $childhref = $href;
            if ($tag === 'a') {
                $candidate = trim((string)$child->getAttribute('href'));
                // Only real navigable links, never javascript: or empty anchors.
                if ($candidate !== '' && stripos($candidate, 'javascript:') !== 0) {
                    $childhref = $candidate;
                }
            }
            self::collect_runs($child, $childhref, $runs);
        }
    }

    /**
     * Collapse whitespace and truncate to the per-block character cap.
     *
     * @param string $text The raw text.
     * @return string The cleaned text.
     */
    protected static function clean(string $text): string {
        $text = preg_replace('/\s+/u', ' ', $text);
        return self::truncate(trim((string)$text));
    }

    /**
     * Truncate to the per-block character cap.
     *
     * @param string $text The text.
     * @return string The truncated text.
     */
    protected static function truncate(string $text): string {
        if (\core_text::strlen($text) > self::MAX_TEXT) {
            return \core_text::substr($text, 0, self::MAX_TEXT);
        }
        return $text;
    }

    /**
     * Return value.
     *
     * @return external_single_structure
     */
    public static function execute_returns(): external_single_structure {
        $run = new external_single_structure([
            'text' => new external_value(PARAM_RAW, 'Run text'),
            'href' => new external_value(PARAM_URL, 'Link target for this run', VALUE_OPTIONAL),
        ]);
        return new external_single_structure([
            'cmid' => new external_value(PARAM_INT, 'Course-module id'),
            'modname' => new external_value(PARAM_PLUGIN, 'Module name'),
            'title' => new external_value(PARAM_TEXT, 'Activity name'),
            'readable' => new external_value(PARAM_BOOL, 'Whether this module type has readable content'),
            'chapterid' => new external_value(PARAM_INT, 'The returned book chapter id (0 if not a book)'),
            'chapters' => new external_multiple_structure(
                new external_single_structure([
                    'id' => new external_value(PARAM_INT, 'Chapter id'),
                    'title' => new external_value(PARAM_TEXT, 'Chapter title'),
                    'subchapter' => new external_value(PARAM_BOOL, 'Whether it is a sub-chapter'),
                ]),
                'Book chapters (empty when not a book)'
            ),
            'blocks' => new external_multiple_structure(
                new external_single_structure([
                    'type' => new external_value(PARAM_ALPHA, 'heading, para, listitem or image'),
                    'level' => new external_value(PARAM_INT, 'Heading level 1-6', VALUE_OPTIONAL),
                    'text' => new external_value(PARAM_RAW, 'Heading text', VALUE_OPTIONAL),
                    'ordered' => new external_value(PARAM_BOOL, 'Ordered list item', VALUE_OPTIONAL),
                    'index' => new external_value(PARAM_INT, 'List item number', VALUE_OPTIONAL),
                    'quote' => new external_value(PARAM_BOOL, 'Block quote', VALUE_OPTIONAL),
                    'pre' => new external_value(PARAM_BOOL, 'Preformatted', VALUE_OPTIONAL),
                    'caption' => new external_value(PARAM_BOOL, 'Figure caption', VALUE_OPTIONAL),
                    'src' => new external_value(PARAM_URL, 'Image source', VALUE_OPTIONAL),
                    'alt' => new external_value(PARAM_TEXT, 'Image alt text', VALUE_OPTIONAL),
                    'width' => new external_value(PARAM_INT, 'Image width', VALUE_OPTIONAL),
                    'height' => new external_value(PARAM_INT, 'Image height', VALUE_OPTIONAL),
                    'runs' => new external_multiple_structure($run, 'Inline text runs', VALUE_OPTIONAL),
                ]),
                'Ordered content blocks'
            ),
        ]);
    }
}
