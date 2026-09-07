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
 * Upgrade steps for the Mnemo (VR cyberspace) course format.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

/**
 * Upgrade the Mnemo course format.
 *
 * @param int $oldversion the version we are upgrading from
 * @return bool
 */
function xmldb_format_mnemo_upgrade($oldversion) {
    global $DB;
    $dbman = $DB->get_manager();

    if ($oldversion < 2026083101) {
        // Three.js is now bundled with the plugin and is the default source.
        // Earlier versions defaulted the setting to a public CDN URL, which may
        // have been stored in config. Clear the stored value only when it still
        // holds that former default, so the bundled copy is used while genuine
        // administrator overrides are preserved.
        $formerdefault = 'https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.min.js';
        if (get_config('format_mnemo', 'threeurl') === $formerdefault) {
            unset_config('threeurl', 'format_mnemo');
        }

        upgrade_plugin_savepoint(true, 2026083101, 'format', 'mnemo');
    }

    if ($oldversion < 2026090601) {
        // New table storing a per-activity building-model override for the scene.
        $table = new xmldb_table('format_mnemo_building');
        $table->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE, null);
        $table->add_field('cmid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);
        $table->add_field('model', XMLDB_TYPE_CHAR, '1333', null, XMLDB_NOTNULL, null, null);
        $table->add_field('timemodified', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
        $table->add_index('cmid', XMLDB_INDEX_UNIQUE, ['cmid']);
        if (!$dbman->table_exists($table)) {
            $dbman->create_table($table);
        }

        upgrade_plugin_savepoint(true, 2026090601, 'format', 'mnemo');
    }

    if ($oldversion < 2026090702) {
        // Per-activity in-view transform (scale, position offset and rotation)
        // set with the in-view editor. Added to the existing building table so a
        // single per-cmid row carries both the model override and the transform.
        $table = new xmldb_table('format_mnemo_building');
        $fields = [
            new xmldb_field('scale', XMLDB_TYPE_NUMBER, '10, 4', null, XMLDB_NOTNULL, null, '1', 'model'),
            new xmldb_field('offsetx', XMLDB_TYPE_NUMBER, '10, 4', null, XMLDB_NOTNULL, null, '0', 'scale'),
            new xmldb_field('offsety', XMLDB_TYPE_NUMBER, '10, 4', null, XMLDB_NOTNULL, null, '0', 'offsetx'),
            new xmldb_field('offsetz', XMLDB_TYPE_NUMBER, '10, 4', null, XMLDB_NOTNULL, null, '0', 'offsety'),
            new xmldb_field('rotation', XMLDB_TYPE_NUMBER, '10, 4', null, XMLDB_NOTNULL, null, '0', 'offsetz'),
        ];
        foreach ($fields as $field) {
            if (!$dbman->field_exists($table, $field)) {
                $dbman->add_field($table, $field);
            }
        }

        upgrade_plugin_savepoint(true, 2026090702, 'format', 'mnemo');
    }

    if ($oldversion < 2026090800) {
        // Per-course transforms for non-activity scene objects (props, gates,
        // pylons) set with the in-view editor, keyed by a stable slot key.
        $table = new xmldb_table('format_mnemo_sceneobj');
        $table->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE, null);
        $table->add_field('courseid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);
        $table->add_field('objkey', XMLDB_TYPE_CHAR, '64', null, XMLDB_NOTNULL, null, null);
        $table->add_field('scale', XMLDB_TYPE_NUMBER, '10, 4', null, XMLDB_NOTNULL, null, '1');
        $table->add_field('offsetx', XMLDB_TYPE_NUMBER, '10, 4', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('offsety', XMLDB_TYPE_NUMBER, '10, 4', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('offsetz', XMLDB_TYPE_NUMBER, '10, 4', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('rotation', XMLDB_TYPE_NUMBER, '10, 4', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('brightness', XMLDB_TYPE_NUMBER, '10, 4', null, XMLDB_NOTNULL, null, '1');
        $table->add_field('timemodified', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
        $table->add_index('courseid-objkey', XMLDB_INDEX_UNIQUE, ['courseid', 'objkey']);
        if (!$dbman->table_exists($table)) {
            $dbman->create_table($table);
        }

        upgrade_plugin_savepoint(true, 2026090800, 'format', 'mnemo');
    }

    if ($oldversion < 2026090900) {
        // Per-course teacher-placed decorative props dropped with the in-view
        // object placer. Each row records the prop type and its grid-snapped
        // base position; any move/scale/rotate/brightness edit lives in
        // format_mnemo_sceneobj under the key placed:<id>.
        $table = new xmldb_table('format_mnemo_placedobj');
        $table->add_field('id', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, XMLDB_SEQUENCE, null);
        $table->add_field('courseid', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, null);
        $table->add_field('type', XMLDB_TYPE_CHAR, '32', null, XMLDB_NOTNULL, null, null);
        $table->add_field('basex', XMLDB_TYPE_NUMBER, '10, 4', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('basez', XMLDB_TYPE_NUMBER, '10, 4', null, XMLDB_NOTNULL, null, '0');
        $table->add_field('timecreated', XMLDB_TYPE_INTEGER, '10', null, XMLDB_NOTNULL, null, '0');
        $table->add_key('primary', XMLDB_KEY_PRIMARY, ['id']);
        $table->add_index('courseid', XMLDB_INDEX_NOTUNIQUE, ['courseid']);
        if (!$dbman->table_exists($table)) {
            $dbman->create_table($table);
        }

        upgrade_plugin_savepoint(true, 2026090900, 'format', 'mnemo');
    }

    if ($oldversion < 2026091000) {
        // Per-axis width/height/depth multipliers for the in-view editor, added
        // to both transform tables so an object can be stretched, not only
        // scaled uniformly. Default 1 keeps existing rows unchanged.
        foreach (['format_mnemo_building', 'format_mnemo_sceneobj'] as $tablename) {
            $table = new xmldb_table($tablename);
            $fields = [
                new xmldb_field('scalex', XMLDB_TYPE_NUMBER, '10, 4', null, XMLDB_NOTNULL, null, '1', 'scale'),
                new xmldb_field('scaley', XMLDB_TYPE_NUMBER, '10, 4', null, XMLDB_NOTNULL, null, '1', 'scalex'),
                new xmldb_field('scalez', XMLDB_TYPE_NUMBER, '10, 4', null, XMLDB_NOTNULL, null, '1', 'scaley'),
            ];
            foreach ($fields as $field) {
                if (!$dbman->field_exists($table, $field)) {
                    $dbman->add_field($table, $field);
                }
            }
        }

        upgrade_plugin_savepoint(true, 2026091000, 'format', 'mnemo');
    }

    return true;
}
