/* tools/check.js - the checks ARCH-07 asks for: no accidental global
 * scope collisions between the renderer's classic scripts, and a lossless
 * .lvl write/read round trip.
 * No framework: each is a plain function that throws on failure. */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const assert = require('assert');
const {unzipSync} = require('fflate');
const lvl = require('../lvl');

const ROOT = path.join(__dirname, '..');

/* Mirrors the grep CLAUDE.md documents by hand for anyone touching these
 * files: a `function foo` or `const FOO =` at the top level of one script
 * silently shadows the same name in another, since index.html loads them
 * as classic scripts sharing one global object. */
function collisions()
{
	const files = ['util.js', 'catalog.js', 'tokens.js', 'grid.js', 'panel.js', 'layout.js', 'code.js', 'app.js'];
	const seenin = new Map();
	const dupes = [];

	for (const f of files) {
		const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
		for (const line of src.split('\n')) {
			const m = line.match(/^(?:function ([a-z_]+)|const ([A-Z_a-z]+) =)/);
			if (!m)
				continue;
			const name = m[1] || m[2];
			if (seenin.has(name))
				dupes.push(name + ': ' + seenin.get(name) + ' and ' + f);
			else
				seenin.set(name, f);
		}
	}
	assert(!dupes.length, 'top-level name collision(s):\n' + dupes.join('\n'));
	console.log('collisions: none among ' + seenin.size + ' top-level names in ' + files.join(', '));
}

/* A level that does not survive its own write/read is a bug lvl.js's
 * validator cannot catch, since it validates shape, not round-trip fidelity. */
async function roundtrip()
{
	const tmp = path.join(os.tmpdir(), 'pb-check-' + process.pid + '.lvl');
	const doc = lvl.blank();
	doc.json.level.information.name = 'round trip probe';

	/* Scenes: an all-empty level is refused; otherwise only scenes holding a
	 * block or entity are written, keyed by number, and read() re-expands. */
	await assert.rejects(lvl.write(tmp, doc), /every scene is empty/, 'an empty level was written');
	doc.json.level.block_data[3][130] = '001';	/* scene 6 */
	doc.json.level.block_data[0][539] = '001';	/* scene 26 */
	doc.scripts['scripts/probe.lua'] = '-- probe\n';
	doc.midi['midi/probe.mid'] = new Uint8Array([1, 2, 3, 4]);
	/* A 1x1 PNG, and a definition that points into it. */
	doc.sheet = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64'));
	doc.json.level.entity_definitions.push({id: 'probe', script: 'scripts/probe.lua', sheet: 'custom', row: 0, size: 1});
	doc.json.level.entities.push({def: 'probe', pos: [12000, 0]});	/* column 120 (x100), scene 6 */

	/* NAT-19: lvl.write() is async now (done, see "Already completed"). */
	await lvl.write(tmp, doc);
	const back = lvl.read(tmp);
	const files = unzipSync(fs.readFileSync(tmp));
	fs.unlinkSync(tmp);
	const wl = JSON.parse(Buffer.from(files['level.json']).toString()).level;
	assert(!('block_data' in wl), 'block_data was written');
	assert.deepStrictEqual(Object.keys(wl.scenes), ['6', '26'], 'empty scenes were written');
	assert(files['sheet.png'], 'sheet.png is not at the archive root');
	assert.deepStrictEqual(wl.entities[0].size, [1, 1], 'entity size is not a [w, h] pair');
	assert.deepStrictEqual(wl.entities[0].pos, [120, 0], 'entity pos is not in block cells');
	assert.deepStrictEqual(Array.from(back.sheet), Array.from(doc.sheet), 'sheet.png did not round-trip');
	assert(Object.values(wl.scenes).every(a => a.length === lvl.H * 20), 'scene is not 12x20');

	/* write() adds information.level_hash to the file alone (never to doc),
	 * so it is checked for shape here and removed before comparing the rest. */
	const hash = back.json.level.information.level_hash;
	assert(/^[0-9a-f]{64}$/.test(hash), 'level_hash is not a SHA-256 hex digest');
	assert.strictEqual(lvl.hashfiles(files), hash, 'level_hash does not match the archive\'s contents');
	delete back.json.level.information.level_hash;
	assert.deepStrictEqual(back.json, doc.json, 'level.json changed shape across write() -> read()');
	assert.strictEqual(back.scripts['scripts/probe.lua'], doc.scripts['scripts/probe.lua'], 'script text did not round-trip');
	assert.deepStrictEqual(
		Array.from(back.midi['midi/probe.mid']), Array.from(doc.midi['midi/probe.mid']),
		'MIDI bytes did not round-trip');
	console.log('round trip: blank() -> write() -> read() is lossless');
}

(async () => {
	for (const check of [collisions, roundtrip]) {
		try {
			await check();
		} catch (e) {
			console.error('FAIL ' + check.name + ': ' + (e.message || e));
			process.exit(1);
		}
	}
	console.log('all checks passed');
})();
