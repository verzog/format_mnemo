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
 * Tests for the get_content external function (the in-headset reader source).
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\external;

/**
 * Tests for structuring a readable activity's content into layout blocks.
 *
 * @covers \format_mnemo\external\get_content
 */
final class get_content_test extends \advanced_testcase {
    /**
     * A page's HTML is parsed into ordered heading, paragraph (with a link run),
     * list-item and image blocks.
     */
    public function test_page_parses_to_blocks(): void {
        global $DB;
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $page = $this->getDataGenerator()->create_module('page', ['course' => $course->id]);
        $html = '<h2>Overview</h2><p>See <a href="https://example.org/">the link</a> now.</p>' .
            '<ul><li>First</li><li>Second</li></ul>' .
            '<img src="https://cdn.example.org/pic.png" alt="A picture" width="120" height="60">';
        $DB->set_field('page', 'content', $html, ['id' => $page->id]);
        $DB->set_field('page', 'contentformat', FORMAT_HTML, ['id' => $page->id]);

        $this->setUser($student);
        $result = get_content::execute($page->cmid);

        $this->assertTrue($result['readable']);
        $this->assertSame('page', $result['modname']);
        $blocks = $result['blocks'];

        $heading = $this->first_of_type($blocks, 'heading');
        $this->assertNotNull($heading);
        $this->assertSame(2, $heading['level']);
        $this->assertSame('Overview', $heading['text']);

        $para = $this->first_of_type($blocks, 'para');
        $this->assertNotNull($para);
        $hrefs = array_filter(array_map(function ($run) {
            return $run['href'] ?? null;
        }, $para['runs']));
        $this->assertContains('https://example.org/', $hrefs);

        $items = array_values(array_filter($blocks, function ($b) {
            return $b['type'] === 'listitem';
        }));
        $this->assertCount(2, $items);

        $image = $this->first_of_type($blocks, 'image');
        $this->assertNotNull($image);
        $this->assertSame('https://cdn.example.org/pic.png', $image['src']);
        $this->assertSame(120, $image['width']);
    }

    /**
     * A book returns its visible chapters and the chosen chapter's body; a
     * different chapter id returns that chapter.
     */
    public function test_book_returns_chapters_and_navigates(): void {
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $book = $this->getDataGenerator()->create_module('book', ['course' => $course->id]);
        $gen = $this->getDataGenerator()->get_plugin_generator('mod_book');
        $ch1 = $gen->create_chapter(['bookid' => $book->id, 'title' => 'Intro',
            'content' => '<p>Chapter one body.</p>']);
        $ch2 = $gen->create_chapter(['bookid' => $book->id, 'title' => 'Deep dive',
            'content' => '<p>Chapter two body.</p>']);

        $this->setUser($student);

        // The default fetch returns the book's chapter list and one of its
        // chapters (the first by page order).
        $default = get_content::execute($book->cmid);
        $this->assertTrue($default['readable']);
        $this->assertCount(2, $default['chapters']);
        $chapterids = array_map(function ($c) {
            return $c['id'];
        }, $default['chapters']);
        $this->assertContains($default['chapterid'], $chapterids);

        // Requesting a specific chapter returns exactly that chapter's body.
        $one = get_content::execute($book->cmid, (int)$ch1->id);
        $this->assertSame((int)$ch1->id, $one['chapterid']);
        $this->assertStringContainsString('one', $one['blocks'][0]['runs'][0]['text']);

        $two = get_content::execute($book->cmid, (int)$ch2->id);
        $this->assertSame((int)$ch2->id, $two['chapterid']);
        $this->assertStringContainsString('two', $two['blocks'][0]['runs'][0]['text']);
    }

    /**
     * A quiz exposes its intro text through the reader.
     */
    public function test_quiz_intro_is_readable(): void {
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $quiz = $this->getDataGenerator()->create_module('quiz', ['course' => $course->id,
            'intro' => '<p>Answer carefully.</p>', 'introformat' => FORMAT_HTML]);

        $this->setUser($student);
        $result = get_content::execute($quiz->cmid);

        $this->assertTrue($result['readable']);
        $para = $this->first_of_type($result['blocks'], 'para');
        $this->assertNotNull($para);
        $this->assertStringContainsString('carefully', $para['runs'][0]['text']);
    }

    /**
     * A module type the reader does not support is flagged not readable and
     * returns no blocks.
     */
    public function test_unsupported_module_is_not_readable(): void {
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $forum = $this->getDataGenerator()->create_module('forum', ['course' => $course->id]);

        $this->setUser($student);
        $result = get_content::execute($forum->cmid);

        $this->assertFalse($result['readable']);
        $this->assertSame([], $result['blocks']);
    }

    /**
     * A nested list is flattened into separate list items, and the parent item
     * does not absorb the nested item's text.
     */
    public function test_nested_lists_flatten_to_separate_items(): void {
        global $DB;
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $page = $this->getDataGenerator()->create_module('page', ['course' => $course->id]);
        $html = '<ul><li>Parent<ul><li>Child</li></ul></li><li>Sibling</li></ul>';
        $DB->set_field('page', 'content', $html, ['id' => $page->id]);
        $DB->set_field('page', 'contentformat', FORMAT_HTML, ['id' => $page->id]);

        $this->setUser($student);
        $result = get_content::execute($page->cmid);

        $items = array_values(array_filter($result['blocks'], function ($b) {
            return $b['type'] === 'listitem';
        }));
        $this->assertCount(3, $items);
        $this->assertStringContainsString('Parent', $items[0]['runs'][0]['text']);
        $this->assertStringNotContainsString('Child', $items[0]['runs'][0]['text']);
    }

    /**
     * An assignment that withholds its description until submissions open
     * exposes no body early, but does once always-show is set.
     */
    public function test_assign_description_release_is_honored(): void {
        global $DB;
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $assign = $this->getDataGenerator()->create_module('assign', ['course' => $course->id,
            'intro' => '<p>Secret prompt.</p>', 'introformat' => FORMAT_HTML]);
        $DB->set_field('assign', 'alwaysshowdescription', 0, ['id' => $assign->id]);
        $DB->set_field('assign', 'allowsubmissionsfromdate', time() + DAYSECS, ['id' => $assign->id]);

        $this->setUser($student);
        $withheld = get_content::execute($assign->cmid);
        $this->assertTrue($withheld['readable']);
        $this->assertSame([], $withheld['blocks']);

        // Once the description is always shown, the intro comes through.
        $DB->set_field('assign', 'alwaysshowdescription', 1, ['id' => $assign->id]);
        $shown = get_content::execute($assign->cmid);
        $para = $this->first_of_type($shown['blocks'], 'para');
        $this->assertNotNull($para);
        $this->assertStringContainsString('Secret', $para['runs'][0]['text']);
    }

    /**
     * Assert that a call exposes no activity body: it is either refused with
     * an exception (require_login_exception, or required_capability_exception)
     * or returns no blocks.
     *
     * @param callable $call The call to make.
     * @param string $secret Text from the body that must not come back.
     */
    protected function assert_no_content(callable $call, string $secret): void {
        try {
            $result = $call();
        } catch (\moodle_exception $e) {
            $this->assertNotEmpty($e->errorcode);
            return;
        }
        $this->assertSame([], $result['blocks']);
        $this->assertStringNotContainsString($secret, json_encode($result));
    }

    /**
     * A page with known body text, in a Mnemo course.
     *
     * @param array $courseoptions Extra course fields.
     * @param array $pageoptions Extra page fields.
     * @return array The course and page.
     */
    protected function secret_page(array $courseoptions = [], array $pageoptions = []): array {
        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo'] + $courseoptions);
        $page = $this->getDataGenerator()->create_module('page', [
            'course' => $course->id,
            'content' => '<p>Secret body text.</p>',
            'contentformat' => FORMAT_HTML,
        ] + $pageoptions);
        return [$course, $page];
    }

    /**
     * A user who is not enrolled in the course gets nothing.
     */
    public function test_not_enrolled_is_refused(): void {
        $this->resetAfterTest();
        [, $page] = $this->secret_page();
        $this->setUser($this->getDataGenerator()->create_user());

        $this->assert_no_content(fn() => get_content::execute($page->cmid), 'Secret');
    }

    /**
     * A user who is not logged in gets nothing.
     */
    public function test_not_logged_in_is_refused(): void {
        $this->resetAfterTest();
        [, $page] = $this->secret_page();
        $this->setUser(null);

        $this->assert_no_content(fn() => get_content::execute($page->cmid), 'Secret');
    }

    /**
     * A student cannot read a hidden activity, but a teacher can.
     */
    public function test_hidden_activity_is_refused(): void {
        $this->resetAfterTest();
        [$course, $page] = $this->secret_page([], ['visible' => 0]);
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $teacher = $this->getDataGenerator()->create_and_enrol($course, 'editingteacher');

        $this->setUser($student);
        $this->assert_no_content(fn() => get_content::execute($page->cmid), 'Secret');

        $this->setUser($teacher);
        $result = get_content::execute($page->cmid);
        $this->assertStringContainsString('Secret', json_encode($result['blocks']));
    }

    /**
     * A student cannot read an activity in a hidden course.
     */
    public function test_hidden_course_is_refused(): void {
        $this->resetAfterTest();
        [$course, $page] = $this->secret_page(['visible' => 0]);
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($student);

        $this->assert_no_content(fn() => get_content::execute($page->cmid), 'Secret');
    }

    /**
     * A student cannot read an activity whose access restriction is still in
     * force (here, a date that has not yet arrived).
     */
    public function test_restricted_activity_is_refused(): void {
        global $CFG;
        $this->resetAfterTest();
        $CFG->enableavailability = true;
        $availability = json_encode(\core_availability\tree::get_root_json(
            [\availability_date\condition::get_json(\availability_date\condition::DIRECTION_FROM, time() + WEEKSECS)],
            \core_availability\tree::OP_AND,
            true
        ));
        [$course, $page] = $this->secret_page([], ['availability' => $availability]);
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $this->setUser($student);

        $this->assert_no_content(fn() => get_content::execute($page->cmid), 'Secret');
    }

    /**
     * A role without the module's own view capability is refused, because the
     * body is read from the table rather than through the module's view page.
     * Moodle already treats the activity as not visible to that role, so the
     * refusal can come from require_login() before the service's own
     * capability check (which stays as a second line of defence).
     */
    public function test_missing_view_capability_is_refused(): void {
        global $DB;
        $this->resetAfterTest();
        [$course, $page] = $this->secret_page();
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $studentrole = $DB->get_field('role', 'id', ['shortname' => 'student'], MUST_EXIST);
        assign_capability('mod/page:view', CAP_PROHIBIT, $studentrole, \context_module::instance($page->cmid)->id);
        $this->setUser($student);

        $this->assert_no_content(fn() => get_content::execute($page->cmid), 'Secret');
    }

    /**
     * A hidden book chapter is never returned, even when asked for by id: it
     * is left out of the chapter list and the first visible chapter is
     * returned instead.
     */
    public function test_hidden_book_chapter_is_not_returned(): void {
        $this->resetAfterTest();
        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $book = $this->getDataGenerator()->create_module('book', ['course' => $course->id]);
        $bookgen = $this->getDataGenerator()->get_plugin_generator('mod_book');
        $visible = $bookgen->create_chapter(['bookid' => $book->id, 'title' => 'Open', 'content' => '<p>Open text.</p>']);
        $hidden = $bookgen->create_chapter([
            'bookid' => $book->id,
            'title' => 'Draft',
            'content' => '<p>Secret draft.</p>',
            'hidden' => 1,
        ]);
        $this->setUser($student);

        $result = get_content::execute($book->cmid, (int)$hidden->id);
        $this->assertSame((int)$visible->id, $result['chapterid']);
        $this->assertSame([(int)$visible->id], array_column($result['chapters'], 'id'));
        $this->assertStringNotContainsString('Secret', json_encode($result));
    }

    /**
     * Unusual links and image sources never break the response: every value
     * passes the declared return types (as the web service layer checks), a
     * link that would not keeps its text unlinked, and a plain web link stays
     * a link.
     */
    public function test_unusual_links_pass_return_validation(): void {
        global $DB;
        $this->resetAfterTest();

        $course = $this->getDataGenerator()->create_course(['format' => 'mnemo']);
        $student = $this->getDataGenerator()->create_and_enrol($course, 'student');
        $page = $this->getDataGenerator()->create_module('page', ['course' => $course->id]);
        $links = [
            'web' => 'https://example.org/',
            'mail' => 'mailto:someone@example.org',
            'phone' => 'tel:+61200000000',
            'anchor' => '#part2',
            'relative' => 'view.php?id=1',
            'spaced' => 'https://example.org/a b',
            'unicode' => 'https://example.org/café',
            'oddscheme' => 'weird+scheme:thing',
        ];
        $html = '<p>';
        foreach ($links as $label => $href) {
            $html .= '<a href="' . s($href) . '">Link' . $label . '</a> ';
        }
        $html .= '</p><img src="weird+scheme:pic" alt="Odd"><img src="https://example.org/ok.png" alt="Fine">';
        $DB->set_field('page', 'content', $html, ['id' => $page->id]);
        $DB->set_field('page', 'contentformat', FORMAT_HTML, ['id' => $page->id]);

        $this->setUser($student);
        $result = get_content::execute($page->cmid);
        // Throws invalid_response_exception if any value fails its type.
        $clean = \core_external\external_api::clean_returnvalue(get_content::execute_returns(), $result);

        $text = '';
        $hrefs = [];
        foreach ($clean['blocks'] as $block) {
            foreach ($block['runs'] ?? [] as $run) {
                $text .= $run['text'] . ' ';
                if (isset($run['href'])) {
                    $hrefs[] = $run['href'];
                }
            }
        }
        foreach (array_keys($links) as $label) {
            $this->assertStringContainsString('Link' . $label, $text);
        }
        $this->assertContains('https://example.org/', $hrefs);
        $srcs = array_column(array_filter($clean['blocks'], fn($b) => $b['type'] === 'image'), 'src');
        $this->assertContains('https://example.org/ok.png', $srcs);
    }

    /**
     * The first block of a given type, or null.
     *
     * @param array $blocks The blocks.
     * @param string $type The block type.
     * @return array|null The block, or null when none.
     */
    protected function first_of_type(array $blocks, string $type): ?array {
        foreach ($blocks as $block) {
            if ($block['type'] === $type) {
                return $block;
            }
        }
        return null;
    }
}
