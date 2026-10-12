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

namespace format_mnemo\local;

use format_mnemo\output\asset_gallery;

/**
 * Saves the asset viewer's per-model settings forms: one card's form, or
 * every changed card at once (the page's "Save all" bar).
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class model_form {
    /** @var int The most models one "Save all" may change. */
    const MAX_BATCH = 500;

    /**
     * The settings form's field names and the PARAM type each is cleaned with.
     *
     * @return array Field name => PARAM_* type.
     */
    public static function params(): array {
        $params = [];
        foreach (model_config::ENVIRONMENTS as $env) {
            $params['env_' . $env] = PARAM_BOOL;
        }
        foreach (['yaw', 'pitch', 'roll', 'scale', 'storeys'] as $field) {
            $params[$field] = PARAM_RAW_TRIMMED;
        }
        foreach (array_keys(model_config::BEHAVIOUR_DEFAULTS) as $flag) {
            $params['beh_' . $flag] = PARAM_BOOL;
        }
        foreach (model_licence::FIELDS as $field) {
            $params['credit_' . $field] = $field === 'source' ? PARAM_URL : PARAM_TEXT;
        }
        return $params;
    }

    /**
     * The categories each configurable model's cards are shown in (an "av"
     * may be both a prop and a vehicle).
     *
     * @return array Model name => string[] of categories.
     */
    public static function model_categories(): array {
        $known = array_flip(asset_gallery::configurable_model_names());
        $map = [];
        foreach (asset_gallery::models() as $model) {
            $key = (string)$model['key'];
            if (isset($known[$key])) {
                $map[$key][] = $model['category'] ?? 'prop';
            }
        }
        return $map;
    }

    /**
     * Save one card's form. Only the settings the card's category shows are
     * taken from the values, so saving a card never resets settings it does
     * not show (an "av" prop card leaves the "av" car's movement alone). An
     * unticked checkbox is not posted, so a missing box reads as off.
     *
     * @param string $name The model name.
     * @param string $category The card's category (prop, vehicle or building).
     * @param array $values The posted form values, by field name (uncleaned).
     * @param array|null $categories model_categories(), when already worked out.
     * @param string[]|null $changed The fields the card changed, to save only
     *     those (two cards may share a model, such as an "av" prop and car, so
     *     one card's untouched values must not undo the other's edits); null
     *     to save every field the card shows.
     * @return bool Whether the model was saved (false for an unknown model or category).
     */
    public static function save(
        string $name,
        string $category,
        array $values,
        ?array $categories = null,
        ?array $changed = null
    ): bool {
        $categories = $categories ?? self::model_categories();
        if (!in_array($category, $categories[$name] ?? [], true)) {
            return false;
        }
        $wants = function (string $field) use ($changed): bool {
            return $changed === null || in_array($field, $changed, true);
        };
        $params = self::params();
        $value = function (string $field) use ($values, $params) {
            $raw = $values[$field] ?? '';
            return clean_param(is_scalar($raw) ? (string)$raw : '', $params[$field]);
        };
        $numornull = function (string $raw): ?float {
            return ($raw === '' || !is_numeric($raw)) ? null : (float)$raw;
        };
        $fields = model_config::category_fields($category);
        $cfg = model_config::get($name);
        $envschanged = false;
        foreach (model_config::ENVIRONMENTS as $env) {
            $envschanged = $envschanged || $wants('env_' . $env);
        }
        if (in_array('envs', $fields, true) && $envschanged) {
            $cfg['envs'] = [];
            foreach (model_config::ENVIRONMENTS as $env) {
                if ($value('env_' . $env)) {
                    $cfg['envs'][] = $env;
                }
            }
        }
        foreach (['yaw', 'pitch', 'roll', 'scale', 'storeys'] as $field) {
            if (in_array($field, $fields, true) && $wants($field)) {
                $cfg[$field] = $numornull($value($field));
            }
        }
        foreach (array_keys(model_config::BEHAVIOUR_DEFAULTS) as $flag) {
            if (in_array('beh_' . $flag, $fields, true) && $wants('beh_' . $flag)) {
                $cfg['behaviour'][$flag] = (bool)$value('beh_' . $flag);
            }
        }
        $credit = $changed === null ? [] : ($cfg['credit'] ?? []);
        foreach (model_licence::FIELDS as $field) {
            if ($wants('credit_' . $field)) {
                $credit[$field] = $value('credit_' . $field);
            }
        }
        $cfg['credit'] = $credit;
        model_config::set($name, $cfg);
        return true;
    }

    /**
     * Save every changed card at once, from the "Save all" bar's JSON list of
     * {model, category, values, changed} entries, where changed lists the
     * fields the card changed (only those are saved). Entries for unknown
     * models are skipped.
     *
     * @param string $json The posted JSON list.
     * @return string[] The names of the models saved.
     */
    public static function save_batch(string $json): array {
        $entries = json_decode($json, true);
        if (!is_array($entries)) {
            return [];
        }
        $categories = self::model_categories();
        $saved = [];
        foreach (array_slice($entries, 0, self::MAX_BATCH) as $entry) {
            if (!is_array($entry) || !is_string($entry['model'] ?? null) || !is_string($entry['category'] ?? null)) {
                continue;
            }
            $values = is_array($entry['values'] ?? null) ? $entry['values'] : [];
            $changed = is_array($entry['changed'] ?? null) ? array_filter($entry['changed'], 'is_string') : null;
            if (self::save($entry['model'], $entry['category'], $values, $categories, $changed)) {
                $saved[] = $entry['model'];
            }
        }
        return array_values(array_unique($saved));
    }
}
