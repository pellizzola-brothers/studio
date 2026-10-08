/* tools/check.js - the three checks ARCH-07 asks for: no accidental global
 * scope collisions between the renderer's classic scripts, a lossless
 * .lvl write/read round trip, and migrate() over the known legacy levels.
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
	 * block (or entity) are written, each full-size, and read() re-expands. */
	await assert.rejects(lvl.write(tmp, doc), /every scene is empty/, 'an empty level was written');
	doc.json.level.block_data[3][130] = '001';	/* scene 2 */
	doc.json.level.block_data[0][539] = '001';	/* scene 8 */
	doc.scripts['scripts/probe.lua'] = '-- probe\n';
	doc.midi['midi/probe.mid'] = new Uint8Array([1, 2, 3, 4]);

	/* NAT-19: lvl.write() is async now (done, see "Already completed"). */
	await lvl.write(tmp, doc);
	const back = lvl.read(tmp);
	const files = unzipSync(fs.readFileSync(tmp));
	fs.unlinkSync(tmp);
	const sc = JSON.parse(Buffer.from(files['level.json']).toString()).level.block_data;
	assert.deepStrictEqual(sc.map(x => x.scene), [2, 8], 'empty scenes were written');
	assert(sc.every(x => x.rows.length === lvl.H && x.rows.every(r => r.length === lvl.W / 9)), 'scene is not full-size');

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

/* lvl.read() runs migrate() + validate() on every file it opens, so pointing
 * it at the sibling website's real, pre-schema levels is the migration test -
 * a thrown validation error here is a migrate() regression, not a fixture
 * problem, since these are files real users' levels already look like. */
function migrations()
{
	const dir = path.join(ROOT, '..', 'website', 'levels');
	if (!fs.existsSync(dir)) {
		console.log('migrate(): skipped, ' + dir + ' is not checked out here');
		return;
	}
	const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
	assert(files.length, 'migrate(): ' + dir + ' exists but has no .json levels to check');
	for (const f of files) {
		const doc = lvl.read(path.join(dir, f));
		assert(Array.isArray(doc.json.level.block_data) && doc.json.level.block_data.length > 0);
		console.log('migrate(): ' + f + ' -> ' + doc.json.level.block_data.length + ' row(s), valid');
	}
}

(async () => {
	for (const check of [collisions, roundtrip, migrations]) {
		try {
			await check();
		} catch (e) {
			console.error('FAIL ' + check.name + ': ' + (e.message || e));
			process.exit(1);
		}
	}
	console.log('all checks passed');
})();
