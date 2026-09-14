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

/**
 * Per-model configuration store: the environment tags, facing, scale and
 * behaviour a site admin sets for each asset model in the asset viewer.
 *
 * Stored as a single JSON blob in the plugin config setting
 * 'format_mnemo/modelconfig', keyed by the model's name (its .glb basename).
 * This supersedes hand-editing the text 'cartypes' box for the fields it
 * covers. All values are validated on write and on read, so a hand-edited or
 * legacy blob can never break the scene.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */
class model_config {
    /** @var string[] The valid environment tags. */
    const ENVIRONMENTS = ['cyberspace', 'grid', 'void'];

    /**
     * Every stored model config, keyed by model name, each already normalised.
     *
     * @return array<string, array> Map of model name => normalised config.
     */
    public static function all(): array {
        $raw = get_config('format_mnemo', 'modelconfig');
        $decoded = ($raw && is_string($raw)) ? json_decode($raw, true) : null;
        if (!is_array($decoded)) {
            return [];
        }
        $out = [];
        foreach ($decoded as $name => $cfg) {
            if (is_string($name) && is_array($cfg)) {
                $out[$name] = self::normalise($cfg);
            }
        }
        return $out;
    }

    /**
     * One model's normalised config, or the defaults when none is stored.
     *
     * @param string $name The model name (.glb basename).
     * @return array The normalised config (envs, yaw, scale, behaviour).
     */
    public static function get(string $name): array {
        $all = self::all();
        return $all[$name] ?? self::normalise([]);
    }

    /**
     * Save one model's config, merged over what is stored and validated. Passing
     * an empty/default config removes the entry so the blob stays compact.
     *
     * @param string $name The model name (.glb basename).
     * @param array $cfg The config to store (envs, yaw, scale, behaviour).
     */
    public static function set(string $name, array $cfg): void {
        $all = self::all();
        $normal = self::normalise($cfg);
        if (self::is_default($normal)) {
            unset($all[$name]);
        } else {
            $all[$name] = $normal;
        }
        set_config('modelconfig', json_encode($all), 'format_mnemo');
    }

    /**
     * Whether a model is enabled for an environment: a model with no environment
     * tags is available everywhere; otherwise only in its tagged environments.
     *
     * @param array $cfg A normalised config (from get()/all()).
     * @param string $env The environment key (cyberspace/grid/void).
     * @return bool True when the model should load in that environment.
     */
    public static function in_environment(array $cfg, string $env): bool {
        $envs = $cfg['envs'] ?? [];
        return empty($envs) || in_array($env, $envs, true);
    }

    /**
     * Normalise a raw config into the stored shape, validating every field so a
     * bad value falls back to its default rather than reaching the client.
     *
     * @param array $cfg The raw config.
     * @return array{envs: string[], yaw: ?float, scale: ?float, behaviour: array}
     */
    protected static function normalise(array $cfg): array {
        $envs = [];
        if (!empty($cfg['envs']) && is_array($cfg['envs'])) {
            foreach ($cfg['envs'] as $env) {
                if (
                    is_string($env) && in_array($env, self::ENVIRONMENTS, true) &&
                        !in_array($env, $envs, true)
                ) {
                    $envs[] = $env;
                }
            }
        }
        // Facing in degrees, kept finite and wrapped to [0, 360); null = auto.
        $yaw = null;
        if (isset($cfg['yaw']) && is_numeric($cfg['yaw']) && is_finite((float)$cfg['yaw'])) {
            $yaw = fmod((float)$cfg['yaw'], 360.0);
            if ($yaw < 0) {
                $yaw += 360.0;
            }
        }
        // Scale multiplier, clamped to a sane range; null = model default.
        $scale = null;
        if (isset($cfg['scale']) && is_numeric($cfg['scale']) && is_finite((float)$cfg['scale'])) {
            $scale = max(0.1, min(10.0, (float)$cfg['scale']));
        }
        // Behaviour flags (reserved for the per-model behaviour panel): a flat
        // map of boolean/scalar toggles, string keys only, kept as-is after a
        // shallow scalar check so a future flag needs no change here.
        $behaviour = [];
        if (!empty($cfg['behaviour']) && is_array($cfg['behaviour'])) {
            foreach ($cfg['behaviour'] as $key => $value) {
                if (is_string($key) && (is_scalar($value) || $value === null)) {
                    $behaviour[$key] = $value;
                }
            }
        }
        return ['envs' => $envs, 'yaw' => $yaw, 'scale' => $scale, 'behaviour' => $behaviour];
    }

    /**
     * Whether a normalised config carries nothing but defaults (so it need not
     * be stored).
     *
     * @param array $cfg A normalised config.
     * @return bool True when it is entirely default.
     */
    protected static function is_default(array $cfg): bool {
        return empty($cfg['envs']) && $cfg['yaw'] === null &&
            $cfg['scale'] === null && empty($cfg['behaviour']);
    }
}
