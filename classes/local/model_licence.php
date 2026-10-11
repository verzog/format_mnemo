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
 * Model credits and licence checks.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\local;

use html_writer;

/**
 * Model credits and licence checks.
 *
 * A model's credit (title, author, licence and source) comes from its glTF
 * asset block - the copyright field, plus the author, license, source and title
 * extras that Sketchfab downloads carry - with any field an admin typed into
 * the model's settings taking precedence. The licence is then sorted into the
 * problems worth flagging: non-commercial, no-derivatives, restrictive or
 * unrecognised, and whether the author must be credited.
 */
class model_licence {
    /** @var string[] The credit fields, in display order. */
    const FIELDS = ['title', 'author', 'licence', 'source'];

    /**
     * The credit fields embedded in a model's glTF asset block.
     *
     * @param array $asset The glTF "asset" object.
     * @return array The title, author, licence, source and copyright (each possibly null).
     */
    public static function from_asset(array $asset): array {
        $extras = is_array($asset['extras'] ?? null) ? $asset['extras'] : [];
        return [
            'title' => self::clean($extras['title'] ?? null),
            'author' => self::clean($extras['author'] ?? null),
            'licence' => self::clean($extras['license'] ?? ($extras['licence'] ?? null)),
            'source' => self::clean($extras['source'] ?? null),
            'copyright' => self::clean($asset['copyright'] ?? null),
        ];
    }

    /**
     * Merge a model's file credit with the credit typed into its settings:
     * each non-empty typed field wins.
     *
     * @param array $file The credit read from the file (see from_asset()).
     * @param array $typed The credit from the model's settings.
     * @return array The title, author, licence, source and copyright.
     */
    public static function merge(array $file, array $typed): array {
        $out = ['copyright' => $file['copyright'] ?? null];
        foreach (self::FIELDS as $field) {
            $value = self::clean($typed[$field] ?? null);
            $out[$field] = $value ?? self::clean($file[$field] ?? null);
        }
        return $out;
    }

    /**
     * What a licence allows, worked out from its name or URL (or, when no
     * licence is given, from the copyright notice, which often names one).
     *
     * @param array $credit A credit (see merge()).
     * @return array Flags: none, free, credit, nc, nd, restrictive, unknown (bools).
     */
    public static function classify(array $credit): array {
        $text = strtolower((string)($credit['licence'] ?? $credit['copyright'] ?? ''));
        $out = ['none' => false, 'free' => false, 'credit' => false, 'nc' => false, 'nd' => false,
            'restrictive' => false, 'unknown' => false];
        if (trim($text) === '') {
            $out['none'] = true;
            return $out;
        }
        if (preg_match('~\bcc-?0\b|publicdomain/zero|public domain~', $text)) {
            $out['free'] = true;
        } else if (preg_match('~\bcc[- ]?by\b|creative commons attribution|creativecommons\.org/licenses/by~', $text)) {
            $out['credit'] = true;
            $out['nc'] = (bool)preg_match('~-nc\b|\bnc\b|non-?commercial~', $text);
            $out['nd'] = (bool)preg_match('~-nd\b|\bnd\b|no-?deriv~', $text);
        } else if (preg_match('~\b(mit|apache|bsd)\b~', $text)) {
            $out['credit'] = true;
        } else if (preg_match('~\b(standard|editorial|all rights reserved|proprietary)\b~', $text)) {
            $out['restrictive'] = true;
        } else {
            $out['unknown'] = true;
        }
        return $out;
    }

    /**
     * The licence flags to show an admin for a model: a warning for each
     * licence problem, and a note when the author must be credited.
     *
     * @param array $credit A credit (see merge()).
     * @return array[] Each flag: level (warning or info) and text.
     */
    public static function flags(array $credit): array {
        $kind = self::classify($credit);
        // Plain text: the caller escapes the flag when it outputs it.
        $name = self::split_link((string)($credit['licence'] ?? $credit['copyright'] ?? ''))[0];
        $out = [];
        foreach (['nc', 'nd', 'restrictive', 'unknown'] as $problem) {
            if ($kind[$problem]) {
                $out[] = ['level' => 'warning', 'text' => get_string('licence_flag_' . $problem, 'format_mnemo', $name)];
            }
        }
        if ($kind['credit']) {
            // Crediting needs an author; without one, the admin must add it.
            $noauthor = self::split_link((string)($credit['author'] ?? ''))[0] === '';
            $out[] = [
                'level' => $noauthor ? 'warning' : 'info',
                'text' => get_string($noauthor ? 'licence_flag_noauthor' : 'licence_flag_credit', 'format_mnemo', $name),
            ];
        }
        return $out;
    }

    /**
     * Queue the licence flags for each model an upload added or replaced, so
     * the admin sees them on the next page. Lite copies are skipped: they share
     * their full model's credit.
     *
     * @param \stored_file[] $files The uploaded files to check.
     */
    public static function notify_uploads(array $files): void {
        $configs = model_config::all();
        foreach ($files as $file) {
            $name = preg_replace('/\.(glb|fbx|zip)$/i', '', $file->get_filename());
            if (model_variants::is_lite($name)) {
                continue;
            }
            $gltf = model_budget::file_gltf($file);
            $asset = is_array($gltf['asset'] ?? null) ? $gltf['asset'] : [];
            $credit = self::merge(self::from_asset($asset), $configs[$name]['credit'] ?? []);
            foreach (self::flags($credit) as $flag) {
                $message = get_string('licence_upload', 'format_mnemo', (object)[
                    'name' => s($file->get_filename()),
                    'problems' => s($flag['text']),
                ]);
                if ($flag['level'] === 'warning') {
                    \core\notification::warning($message);
                } else {
                    \core\notification::info($message);
                }
            }
        }
    }

    /**
     * Whether a model's credit is worth showing students: it names an author
     * or a licence, or carries a copyright notice.
     *
     * @param array $credit A credit (see merge()).
     * @return bool True to list it under the 3D view.
     */
    public static function is_creditable(array $credit): bool {
        return !empty($credit['author']) || !empty($credit['licence']) || !empty($credit['copyright']);
    }

    /**
     * The credit line for a model, as HTML: its title linked to its source, the
     * author linked to their page, and the licence linked to its text, wherever
     * those links are known. Every part is escaped.
     *
     * @param array $credit A credit (see merge()).
     * @param string $fallback The title to use when the credit has none (the model name).
     * @return string The credit line HTML.
     */
    public static function credit_html(array $credit, string $fallback): string {
        $part = function (?string $text, ?string $url): string {
            if ($url !== null) {
                return html_writer::link($url, s($text), ['target' => '_blank', 'rel' => 'noopener']);
            }
            return s($text);
        };
        [$title, $titleurl] = self::split_link((string)($credit['title'] ?? ''));
        $title = $title === '' ? $fallback : $title;
        $source = self::safe_url($credit['source'] ?? null) ?? $titleurl;
        [$author, $authorurl] = self::split_link((string)($credit['author'] ?? ''));
        // With no licence named, the copyright notice stands in for it (the
        // standard glTF field, which often names the licence too).
        [$licence, $licenceurl] = self::split_link((string)($credit['licence'] ?? $credit['copyright'] ?? ''));
        $a = (object)[
            'title' => $part($title, $source),
            'author' => $part($author, $authorurl),
            'licence' => $part($licence, $licenceurl),
        ];
        if ($author !== '' && $licence !== '') {
            return get_string('credit_line', 'format_mnemo', $a);
        }
        if ($author !== '') {
            return get_string('credit_line_nolicence', 'format_mnemo', $a);
        }
        if ($licence !== '') {
            return get_string('credit_line_noauthor', 'format_mnemo', $a);
        }
        return $a->title;
    }

    /**
     * Split "Name (https://...)" - the form Sketchfab uses for authors and
     * licences - into the name and the URL. A bare URL gives itself as both.
     *
     * @param string $text The text to split.
     * @return array The name (possibly empty) and the URL (or null).
     */
    public static function split_link(string $text): array {
        $text = trim($text);
        if (preg_match('~^(.*?)\s*\((https?://[^\s)]+)\)$~', $text, $m)) {
            $name = trim($m[1]);
            return [$name === '' ? $m[2] : $name, self::safe_url($m[2])];
        }
        $url = self::safe_url($text);
        return [$text, $url];
    }

    /**
     * A web URL that is safe to link to, or null.
     *
     * @param mixed $url The candidate URL.
     * @return string|null The URL if it is a valid http(s) URL, else null.
     */
    public static function safe_url($url): ?string {
        if (!is_string($url) || !preg_match('~^https?://~i', trim($url))) {
            return null;
        }
        $clean = clean_param(trim($url), PARAM_URL);
        return $clean === '' ? null : $clean;
    }

    /**
     * A trimmed, length-capped credit string, or null when empty or not a string.
     *
     * @param mixed $value The raw value.
     * @return string|null The cleaned string, or null.
     */
    public static function clean($value): ?string {
        if (!is_string($value)) {
            return null;
        }
        $value = trim($value);
        return $value === '' ? null : \core_text::substr($value, 0, 255);
    }
}
