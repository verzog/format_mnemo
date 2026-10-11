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
 * Tests for model credits and licence checks.
 *
 * @package    format_mnemo
 * @copyright  2026 Vernon Spain
 * @license    http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

namespace format_mnemo\local;

/**
 * Tests reading credits from glTF, merging typed credits, licence flags and
 * the credit line.
 *
 * @covers \format_mnemo\local\model_licence
 */
final class model_licence_test extends \advanced_testcase {
    /** @var array The asset block of a Sketchfab download. */
    const SKETCHFAB = [
        'version' => '2.0',
        'generator' => 'Sketchfab-16.64.0',
        'extras' => [
            'author' => 'KraftKatStudio (https://sketchfab.com/KraftKatStudio)',
            'license' => 'CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)',
            'source' => 'https://sketchfab.com/3d-models/flying-car-58c5285a35f9434daa3ec82d3872aebf',
            'title' => 'flying car',
        ],
    ];

    /**
     * A Sketchfab download's extras give the title, author, licence and source.
     */
    public function test_from_asset(): void {
        $credit = model_licence::from_asset(self::SKETCHFAB);
        $this->assertSame('flying car', $credit['title']);
        $this->assertSame('KraftKatStudio (https://sketchfab.com/KraftKatStudio)', $credit['author']);
        $this->assertStringStartsWith('CC-BY-4.0', $credit['licence']);
        $this->assertStringStartsWith('https://sketchfab.com/', $credit['source']);
        $this->assertNull($credit['copyright']);

        $plain = model_licence::from_asset(['copyright' => ' (c) 2026 Ada, CC0 ', 'extras' => 'not an array']);
        $this->assertSame('(c) 2026 Ada, CC0', $plain['copyright']);
        $this->assertNull($plain['author']);
    }

    /**
     * Typed fields win over the file's; blank typed fields keep the file's.
     */
    public function test_merge(): void {
        $credit = model_licence::merge(model_licence::from_asset(self::SKETCHFAB), ['author' => 'Ada', 'title' => '  ']);
        $this->assertSame('Ada', $credit['author']);
        $this->assertSame('flying car', $credit['title']);
        $this->assertStringStartsWith('CC-BY-4.0', $credit['licence']);
    }

    /**
     * Licence texts and the flags they raise.
     *
     * @return array[] Test cases: licence, copyright, then the expected true flags.
     */
    public static function classify_provider(): array {
        return [
            'nothing' => [null, null, ['none']],
            'CC0' => ['CC0-1.0', null, ['free']],
            'public domain URL' => ['https://creativecommons.org/publicdomain/zero/1.0/', null, ['free']],
            'CC-BY' => ['CC-BY-4.0 (http://creativecommons.org/licenses/by/4.0/)', null, ['credit']],
            'CC BY words' => ['Creative Commons Attribution 4.0', null, ['credit']],
            'CC-BY-NC' => ['CC-BY-NC-4.0', null, ['credit', 'nc']],
            'CC-BY-NC-ND' => ['CC-BY-NC-ND-4.0', null, ['credit', 'nc', 'nd']],
            'CC-BY-ND URL' => ['https://creativecommons.org/licenses/by-nd/4.0/', null, ['credit', 'nd']],
            'MIT' => ['MIT', null, ['credit']],
            'Sketchfab standard' => ['Standard', null, ['restrictive']],
            'editorial' => ['Editorial use only', null, ['restrictive']],
            'something else' => ['Royalty-free from my shop', null, ['unknown']],
            'licence in the copyright' => [null, '(c) 2026 Ada, CC-BY-4.0', ['credit']],
            'bare copyright' => [null, '(c) 2026 Ada', ['unknown']],
        ];
    }

    /**
     * Each licence is sorted into the right flags.
     *
     * @dataProvider classify_provider
     * @param string|null $licence The licence text.
     * @param string|null $copyright The copyright notice.
     * @param string[] $expected The flags expected to be true.
     */
    public function test_classify(?string $licence, ?string $copyright, array $expected): void {
        $kind = model_licence::classify(['licence' => $licence, 'copyright' => $copyright]);
        $this->assertEqualsCanonicalizing($expected, array_keys(array_filter($kind)));
    }

    /**
     * Problems are warnings; a credit is a note, or a warning when no author
     * is recorded; a free licence raises nothing.
     */
    public function test_flags(): void {
        $flags = model_licence::flags(['licence' => 'CC-BY-NC-4.0 (https://x.test/)', 'author' => 'Ada']);
        $this->assertSame(['warning', 'info'], array_column($flags, 'level'));
        $this->assertStringContainsString('CC-BY-NC-4.0', $flags[0]['text']);
        $this->assertStringNotContainsString('https://', $flags[0]['text']);

        $flags = model_licence::flags(['licence' => 'CC-BY-4.0']);
        $this->assertSame(['warning'], array_column($flags, 'level'));
        $this->assertStringContainsString('no author', $flags[0]['text']);

        $this->assertSame([], model_licence::flags(['licence' => 'CC0']));
        $this->assertSame([], model_licence::flags([]));
    }

    /**
     * The credit line links the title to the source, the author and licence to
     * their pages, escapes everything, and never links a non-web address.
     */
    public function test_credit_html(): void {
        $html = model_licence::credit_html(model_licence::from_asset(self::SKETCHFAB), 'av');
        $this->assertStringContainsString('href="https://sketchfab.com/3d-models/flying-car', $html);
        $this->assertStringContainsString('>flying car</a>', $html);
        $this->assertStringContainsString('href="https://sketchfab.com/KraftKatStudio"', $html);
        $this->assertStringContainsString('>KraftKatStudio</a>', $html);
        $this->assertStringContainsString('>CC-BY-4.0</a>', $html);

        $html = model_licence::credit_html([
            'title' => '<b>Tower</b>',
            'author' => 'Ada <script>',
            'licence' => null,
            'source' => 'javascript:alert(1)',
        ], 'building-quiz');
        $this->assertStringNotContainsString('<b>', $html);
        $this->assertStringNotContainsString('<script', $html);
        $this->assertStringNotContainsString('javascript:', $html);
        $this->assertStringContainsString('&lt;b&gt;Tower&lt;/b&gt; by Ada &lt;script&gt;', $html);

        // A copyright notice alone is credited, standing in for the licence.
        $copyright = ['copyright' => '(c) 2026 Ada, CC-BY-4.0'];
        $this->assertTrue(model_licence::is_creditable($copyright));
        $this->assertSame('bench, (c) 2026 Ada, CC-BY-4.0', model_licence::credit_html($copyright, 'bench'));
        $this->assertFalse(model_licence::is_creditable(['title' => 'Bench']));

        // No title falls back to the model name.
        $html = model_licence::credit_html(['licence' => 'CC0'], 'lamp');
        $this->assertSame('lamp, CC0', $html);
    }

    /**
     * Uploading a model with licence problems queues them for the admin; a
     * lite copy and a free model raise nothing.
     */
    public function test_notify_uploads(): void {
        $this->resetAfterTest();
        $glb = function (array $asset): string {
            $json = json_encode(['asset' => $asset]);
            while (strlen($json) % 4 !== 0) {
                $json .= ' ';
            }
            $chunk = pack('V', strlen($json)) . 'JSON' . $json;
            return 'glTF' . pack('V', 2) . pack('V', 12 + strlen($chunk)) . $chunk;
        };
        $fs = get_file_storage();
        $base = ['contextid' => \context_system::instance()->id, 'component' => 'format_mnemo',
            'filearea' => 'assetpack', 'itemid' => 0, 'filepath' => '/'];
        $nc = $fs->create_file_from_string(['filename' => 'statue.glb'] + $base, $glb([
            'version' => '2.0', 'extras' => ['license' => 'CC-BY-NC-4.0', 'author' => 'Ada'],
        ]));
        $lite = $fs->create_file_from_string(['filename' => 'statue-lite.glb'] + $base, $glb([
            'version' => '2.0', 'extras' => ['license' => 'Standard'],
        ]));
        $free = $fs->create_file_from_string(['filename' => 'bench.glb'] + $base, $glb([
            'version' => '2.0', 'copyright' => 'CC0',
        ]));
        \core\notification::fetch();

        model_licence::notify_uploads([$nc, $lite, $free]);
        $notes = \core\notification::fetch();
        $this->assertCount(2, $notes);
        $this->assertSame(\core\notification::WARNING, $notes[0]->get_message_type());
        $this->assertStringContainsString('statue.glb', $notes[0]->get_message());
        $this->assertStringContainsString('Non-commercial', $notes[0]->get_message());
        $this->assertSame(\core\notification::INFO, $notes[1]->get_message_type());
    }
}
