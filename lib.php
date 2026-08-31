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
 * Main library for the Mnemo (VR cyberspace) course format.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

use core\output\inplace_editable;

/**
 * The Mnemo course format.
 *
 * Sections are rendered for learners as nodes in a Johnny Mnemonic style
 * cyberspace that can be explored in a WebXR headset with gestural navigation.
 * When editing is turned on the standard Moodle section editor is shown so that
 * teachers can build the course in the usual 2D interface.
 */
class format_mnemo extends core_courseformat\base {
    /**
     * Maximum accepted upload size for a topic image, in bytes.
     *
     * The client downscales every image to a small texture, so this only caps
     * what is stored; it is generous enough for an ordinary photo. Keep this in
     * sync with the filemanager options in section_format_options(),
     * update_section_format_options() and \format_mnemo\form\editsection.
     */
    const TOPIC_IMAGE_MAXBYTES = 5242880;

    /**
     * Returns true. This format uses sections.
     *
     * @return bool
     */
    public function uses_sections() {
        return true;
    }

    /**
     * Returns true so the collapsible course index drawer is available while editing.
     *
     * @return bool
     */
    public function uses_course_index() {
        return true;
    }

    /**
     * This format does not use activity indentation.
     *
     * @return bool
     */
    public function uses_indentation(): bool {
        return false;
    }

    /**
     * Opt in to the reactive (AJAX) component based editing UI.
     *
     * @return bool
     */
    public function supports_components() {
        return true;
    }

    /**
     * Returns the information about the ajax support in the given source format.
     *
     * @return stdClass
     */
    public function supports_ajax() {
        $ajaxsupport = new stdClass();
        $ajaxsupport->capable = true;
        return $ajaxsupport;
    }

    /**
     * Loads all of the course sections into the navigation.
     *
     * @param global_navigation $navigation
     * @param navigation_node $node The course node within the navigation
     * @return void
     */
    public function extend_course_navigation($navigation, navigation_node $node) {
        global $PAGE;
        // If section is specified in course/view.php, make sure it is expanded in navigation.
        if ($navigation->includesectionnum === false) {
            $selectedsection = optional_param('section', null, PARAM_INT);
            $iscourseview = $PAGE->url->compare(new moodle_url('/course/view.php'), URL_MATCH_BASE);
            $notajax = !defined('AJAX_SCRIPT') || AJAX_SCRIPT == '0';
            if ($selectedsection !== null && $notajax && $iscourseview) {
                $navigation->includesectionnum = $selectedsection;
            }
        }
        parent::extend_course_navigation($navigation, $node);
    }

    /**
     * Definitions of the additional options that this course format uses for the course.
     *
     * @param bool $foreditform
     * @return array of options
     */
    public function course_format_options($foreditform = false) {
        static $courseformatoptions = false;
        if ($courseformatoptions === false) {
            $courseconfig = get_config('moodlecourse');
            $courseformatoptions = [
                'hiddensections' => [
                    'default' => $courseconfig->hiddensections ?? 1,
                    'type' => PARAM_INT,
                ],
                'coursedisplay' => [
                    'default' => $courseconfig->coursedisplay ?? COURSE_DISPLAY_SINGLEPAGE,
                    'type' => PARAM_INT,
                ],
                'mnemoenvironment' => [
                    'default' => get_config('format_mnemo', 'defaultenvironment') ?: 'cyberspace',
                    'type' => PARAM_ALPHA,
                ],
                'mnemopalette' => [
                    'default' => get_config('format_mnemo', 'defaultpalette') ?: 'cyan',
                    'type' => PARAM_ALPHA,
                ],
            ];
        }
        if ($foreditform && !isset($courseformatoptions['coursedisplay']['label'])) {
            $courseformatoptionsedit = [
                'hiddensections' => [
                    'label' => new lang_string('hiddensections'),
                    'help' => 'hiddensections',
                    'help_component' => 'moodle',
                    'element_type' => 'select',
                    'element_attributes' => [
                        [
                            0 => new lang_string('hiddensectionscollapsed'),
                            1 => new lang_string('hiddensectionsinvisible'),
                        ],
                    ],
                ],
                'coursedisplay' => [
                    'label' => new lang_string('coursedisplay'),
                    'element_type' => 'select',
                    'element_attributes' => [
                        [
                            COURSE_DISPLAY_SINGLEPAGE => new lang_string('coursedisplay_single'),
                            COURSE_DISPLAY_MULTIPAGE => new lang_string('coursedisplay_multi'),
                        ],
                    ],
                    'help' => 'coursedisplay',
                    'help_component' => 'moodle',
                ],
                'mnemoenvironment' => [
                    'label' => new lang_string('environment', 'format_mnemo'),
                    'element_type' => 'select',
                    'element_attributes' => [
                        [
                            'cyberspace' => new lang_string('environment_cyberspace', 'format_mnemo'),
                            'grid' => new lang_string('environment_grid', 'format_mnemo'),
                            'void' => new lang_string('environment_void', 'format_mnemo'),
                        ],
                    ],
                    'help' => 'environment',
                    'help_component' => 'format_mnemo',
                ],
                'mnemopalette' => [
                    'label' => new lang_string('palette', 'format_mnemo'),
                    'element_type' => 'select',
                    'element_attributes' => [
                        [
                            'cyan' => new lang_string('palette_cyan', 'format_mnemo'),
                            'amber' => new lang_string('palette_amber', 'format_mnemo'),
                            'magenta' => new lang_string('palette_magenta', 'format_mnemo'),
                            'green' => new lang_string('palette_green', 'format_mnemo'),
                        ],
                    ],
                    'help' => 'palette',
                    'help_component' => 'format_mnemo',
                ],
            ];
            $courseformatoptions = array_merge_recursive($courseformatoptions, $courseformatoptionsedit);
        }
        return $courseformatoptions;
    }

    /**
     * Definitions of the additional options that this course format uses for section.
     *
     * A per-section "topic image" filemanager is offered on the section editing
     * form only. It is not stored as a scalar option; the uploaded file lives in
     * the 'sectionimage' file area and is saved in update_section_format_options().
     *
     * @param bool $foreditform
     * @return array
     */
    public function section_format_options($foreditform = false) {
        if (!$foreditform) {
            return [];
        }
        return [
            'topicimage' => [
                'label' => new lang_string('topicimage', 'format_mnemo'),
                'element_type' => 'filemanager',
                'element_attributes' => [
                    null,
                    [
                        'subdirs' => 0,
                        'maxfiles' => 1,
                        'maxbytes' => self::TOPIC_IMAGE_MAXBYTES,
                        'accepted_types' => ['web_image'],
                    ],
                ],
                'help' => 'topicimage',
                'help_component' => 'format_mnemo',
            ],
        ];
    }

    /**
     * Return an instance of the section editing form that prepares the topic
     * image draft area.
     *
     * @param mixed $action the action attribute for the form
     * @param array $customdata the array with custom data to be passed to the form
     * @return \moodleform
     */
    public function editsection_form($action, $customdata = []) {
        global $CFG;
        require_once($CFG->dirroot . '/course/editsection_form.php');
        if (!array_key_exists('course', $customdata)) {
            $customdata['course'] = $this->get_course();
        }
        return new \format_mnemo\form\editsection($action, $customdata);
    }

    /**
     * Save the section format options, storing the topic image file separately.
     *
     * @param stdClass|array $data return value from moodleform::get_data() or array with data
     * @return bool whether there were any changes to the options values
     */
    public function update_section_format_options($data) {
        $data = (array)$data;
        if (isset($data['topicimage']) && !empty($data['id'])) {
            $context = context_course::instance($this->get_courseid());
            file_save_draft_area_files(
                $data['topicimage'],
                $context->id,
                'format_mnemo',
                'sectionimage',
                (int)$data['id'],
                ['subdirs' => 0, 'maxfiles' => 1, 'maxbytes' => self::TOPIC_IMAGE_MAXBYTES, 'accepted_types' => ['web_image']]
            );
            // Not a stored scalar option; the file area is the source of truth.
            unset($data['topicimage']);
        }
        return parent::update_section_format_options($data);
    }

    /**
     * Whether this format allows to delete sections.
     *
     * @param int|stdClass|section_info $section
     * @return bool
     */
    public function can_delete_section($section) {
        return true;
    }

    /**
     * Returns the display name of the given section.
     *
     * Learners see the teacher's section title on the cyberspace signs (via
     * get_section_title_plain()); this method drives the 2D editing interface,
     * where the title is shown together with its topic number for orientation.
     * Sections without a title fall back to the default "Section N".
     *
     * @param int|stdClass|section_info $section Section object or section number
     * @return string
     */
    public function get_section_name($section) {
        $section = $this->get_section($section);
        if ((string)$section->name !== '') {
            $title = format_string(
                $section->name,
                true,
                ['context' => context_course::instance($this->get_courseid())]
            );
            if ($section->section != 0) {
                return get_string('sectiontitlenumbered', 'format_mnemo', (object)[
                    'title' => $title,
                    'number' => $section->section,
                ]);
            }
            return $title;
        }
        return $this->get_default_section_name($section);
    }

    /**
     * The plain section title, without the editing-view topic number.
     *
     * Used for the cyberspace signs, where the teacher's title is shown on its
     * own; sections without a title fall back to the default "Section N".
     *
     * @param int|stdClass|section_info $section Section object or section number
     * @return string
     */
    public function get_section_title_plain($section): string {
        $section = $this->get_section($section);
        if ((string)$section->name !== '') {
            return format_string(
                $section->name,
                true,
                ['context' => context_course::instance($this->get_courseid())]
            );
        }
        return $this->get_default_section_name($section);
    }

    /**
     * Returns the default section name for the format.
     *
     * @param stdClass $section Section object from database or just field course_sections section
     * @return string The default value for the section name.
     */
    public function get_default_section_name($section) {
        if ($section->section == 0) {
            return get_string('section0name', 'format_mnemo');
        }
        return get_string('sectionname', 'format_mnemo') . ' ' . $section->section;
    }

    /**
     * Indicates whether the course format supports the creation of a news forum.
     *
     * @return bool
     */
    public function supports_news() {
        return true;
    }

    /**
     * Returns whether this course format allows the activity to be displayed inline.
     *
     * @param cm_info|stdClass $cm the course module
     * @param int|stdClass|section_info $section the section
     * @return bool
     */
    public function allow_stealth_module_visibility($cm, $section) {
        return true;
    }

    /**
     * Updates format options for a course.
     *
     * In case if course format was changed to 'mnemo', we try to copy options from the previous format.
     *
     * @param stdClass|array $data return value from moodleform::get_data() or array with data
     * @param stdClass $oldcourse if this function is called from update_course()
     * @return bool whether there were any changes to the options values
     */
    public function update_course_format_options($data, $oldcourse = null) {
        $data = (array)$data;
        if ($oldcourse !== null) {
            $oldcourse = (array)$oldcourse;
            $options = $this->course_format_options();
            foreach ($options as $key => $unused) {
                if (!array_key_exists($key, $data)) {
                    if (array_key_exists($key, $oldcourse)) {
                        $data[$key] = $oldcourse[$key];
                    }
                }
            }
        }
        return $this->update_format_options($data);
    }

    /**
     * Return the plugin config settings for external functions.
     *
     * @return array the list of settings
     */
    public function get_config_for_external() {
        // Return everything (nothing to hide).
        return $this->get_format_options();
    }
}

/**
 * Implements the inplace editable feature for section names.
 *
 * @param string $itemtype
 * @param int $itemid
 * @param mixed $newvalue
 * @return inplace_editable
 */
function format_mnemo_inplace_editable($itemtype, $itemid, $newvalue) {
    global $DB, $CFG;
    require_once($CFG->dirroot . '/course/lib.php');
    if ($itemtype === 'sectionname' || $itemtype === 'sectionnamenl') {
        $section = $DB->get_record_sql(
            'SELECT s.* FROM {course_sections} s JOIN {course} c ON s.course = c.id WHERE s.id = ? AND c.format = ?',
            [$itemid, 'mnemo'],
            MUST_EXIST
        );
        return course_get_format($section->course)->inplace_editable_update_section_name($section, $itemtype, $newvalue);
    }
}

/**
 * Serve the per-section topic image files.
 *
 * @param stdClass $course the course object
 * @param stdClass $cm the course module object
 * @param context $context the context
 * @param string $filearea the name of the file area
 * @param array $args extra arguments (itemid, path)
 * @param bool $forcedownload whether or not force download
 * @param array $options additional options affecting the file serving
 * @return bool false if the file was not found, just send the file otherwise and do not return anything
 */
function format_mnemo_pluginfile($course, $cm, $context, $filearea, $args, $forcedownload, array $options = []) {
    if ($context->contextlevel != CONTEXT_COURSE) {
        return false;
    }
    if ($filearea !== 'sectionimage') {
        return false;
    }
    require_login($course);

    $itemid = (int)array_shift($args);

    // The itemid is a course_sections id. Confirm it belongs to this course and
    // is visible to the user before serving, so a retained URL to a since-hidden
    // section's image cannot be used to bypass section visibility.
    $modinfo = get_fast_modinfo($course);
    $sectioninfo = null;
    foreach ($modinfo->get_section_info_all() as $section) {
        if ((int)$section->id === $itemid) {
            $sectioninfo = $section;
            break;
        }
    }
    if ($sectioninfo === null) {
        return false;
    }
    if (!$sectioninfo->uservisible && empty($sectioninfo->availableinfo)) {
        return false;
    }

    $filename = array_pop($args);
    $filepath = $args ? '/' . implode('/', $args) . '/' : '/';

    $fs = get_file_storage();
    $file = $fs->get_file($context->id, 'format_mnemo', 'sectionimage', $itemid, $filepath, $filename);
    if (!$file || $file->is_directory()) {
        return false;
    }

    send_stored_file($file, null, 0, $forcedownload, $options);
    return true;
}
