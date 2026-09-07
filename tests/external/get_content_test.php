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

        $first = get_content::execute($book->cmid);
        $this->assertTrue($first['readable']);
        $this->assertCount(2, $first['chapters']);
        $this->assertSame((int)$ch1->id, $first['chapterid']);
        $this->assertStringContainsString('one', $first['blocks'][0]['runs'][0]['text']);

        $second = get_content::execute($book->cmid, (int)$ch2->id);
        $this->assertSame((int)$ch2->id, $second['chapterid']);
        $this->assertStringContainsString('two', $second['blocks'][0]['runs'][0]['text']);
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
