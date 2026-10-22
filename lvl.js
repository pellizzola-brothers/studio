/* lvl.js - reading, writing and validating .lvl archives.
 *
 * A .lvl is a ZIP holding:
 *	level.json	the level itself (schema below)
 *	scripts/*.lua	user-written Lua
 *	midi/*.mid	music
 *	sheet.png	the level's own sprites, appended into one PNG (optional)
 */
'use strict';

const fs = require('fs');
const crypto = require('crypto');
const {zip, unzipSync, strToU8, strFromU8} = require('fflate');
const cat = require('./catalog');

/* W, H and B are catalog.js's alone (ARCH-02) - this file used to redefine
 * W itself, which meant the cross-repo row-width contract CLAUDE.md documents
 * lived in two places, one of which required('./catalog') and ignored it. */
const BG = ['foo', 'bar', 'baz'];	/* the only accepted background presets */
const MAXERR = 12;			/* errors reported before we stop counting */

function isstr(v) { return typeof v === 'string'; }
function isnum(v) { return typeof v === 'number' && isFinite(v); }

/* Collect every problem with `j` as a human-readable line.  Empty means valid.
 * Bails out at MAXERR so a single mangled file cannot spam megabytes. */
function validate(j)
{
	const e = [];
	const l = j && j.level;

	if (!l || typeof l !== 'object')
		return ['missing "level" object'];

	const i = l.information;
	if (!i || typeof i !== 'object')
		e.push('missing level.information');
	else for (const k of ['name', 'description', 'author'])
		if (!isstr(i[k]))
			e.push('information.' + k + ' must be a string');

	if (!Array.isArray(l.block_data) || !l.block_data.length)
		e.push('block_data must be a non-empty array of rows');
	else for (let y = 0; y < l.block_data.length && e.length < MAXERR; y++) {
		const row = l.block_data[y];
		if (!Array.isArray(row) || row.length !== cat.W) {
			e.push('block_data row ' + y + ' must hold exactly ' + cat.W + ' entries');
			continue;
		}
		for (let x = 0; x < cat.W; x++)
			if (!isstr(row[x]) || !/^\d{3}$/.test(row[x])) {
				e.push('block_data[' + y + '][' + x + '] must be a 3-digit id string');
				break;
			}
	}

	const defs = new Set();
	if (!Array.isArray(l.entity_definitions))
		e.push('entity_definitions must be an array');
	else l.entity_definitions.forEach((d, n) => {
		if (!d || !isstr(d.id) || !d.id || !isstr(d.script) || !d.script) {
			e.push('entity_definitions[' + n + '] needs a non-empty string id and script');
			return;
		}
		if (!cat.SHEETKINDS.includes(d.sheet))
			e.push('entity_definitions[' + n + '].sheet must be one of ' + cat.SHEETKINDS.join(', '));
		if (!Number.isInteger(d.row) || d.row < 0)
			e.push('entity_definitions[' + n + '].row must be a non-negative integer');
		if (!Number.isInteger(d.frame) || d.frame < 1)
			e.push('entity_definitions[' + n + '].frame must be a positive integer');
		if (d.animations !== undefined && (!d.animations || typeof d.animations !== 'object' || Array.isArray(d.animations)))
			e.push('entity_definitions[' + n + '].animations must be an object keyed by name');
		else if (d.animations !== undefined)
			for (const [name, a] of Object.entries(d.animations))
				if (!a || !Number.isInteger(a.start) || a.start < 0 || !Number.isInteger(a.frames) || a.frames < 1)
					e.push('entity_definitions[' + n + '].animations.' + name + ' needs start of 0 or more and frames of 1 or more');
		if (defs.has(d.id))
			e.push('duplicate entity definition "' + d.id + '"');
		defs.add(d.id);
	});

	if (!Array.isArray(l.entities))
		e.push('entities must be an array');
	else l.entities.forEach((s, n) => {
		if (!s || !isstr(s.def)) {
			e.push('entities[' + n + '].def must be a string');
			return;
		}
		if (!defs.has(s.def))
			e.push('entities[' + n + '] references unknown definition "' + s.def + '"');
		if (!Array.isArray(s.pos) || s.pos.length !== 2 || !s.pos.every(v => isnum(v) && v % cat.B === 0))
			e.push('entities[' + n + '].pos must be [x, y] in world pixels, on the block grid');
		if (!Number.isInteger(s.size) || s.size < cat.SPRITEPX || s.size % cat.SPRITEPX)
			e.push('entities[' + n + '].size must be a positive multiple of ' + cat.SPRITEPX);
	});

	if (!Array.isArray(l.backgrounds))
		e.push('backgrounds must be an array');
	else l.backgrounds.forEach((b, n) => {
		if (!BG.includes(b))
			e.push('backgrounds[' + n + '] "' + b + '" is not a preset (' + BG.join(', ') + ')');
	});

	return e.slice(0, MAXERR);
}

/* Semantic checks beyond validate(): things textures/README.md's contract
 * requires for the *game* to run the level, but that are not malformed data,
 * so a level failing them must still be allowed to save - an author mid-build
 * legitimately has no end block yet.  Returns warning strings; empty means
 * clean.  Takes the whole document, not just json, because "a definition's
 * script is missing" and "a script is unused" both need doc.scripts. */
function review(doc)
{
	const l = doc.json.level;
	const w = [];
	let ends = 0;

	/* VIS-17: a 3-digit id validate() already accepts as *shape*-valid can
	 * still name no block this build's catalog.js knows about (a level
	 * authored against a newer catalog, or a hand-edited/corrupted one) -
	 * grid.js renders that cell as a hatch rather than a texture, and this
	 * is the warning that says why, the first time each unknown id turns up. */
	const knownblocks = new Set(cat.BLOCKS.map(b => String(b.id).padStart(3, '0')));
	const unknownblocks = new Set();
	for (const row of l.block_data)
		for (const id of row) {
			if (id === String(cat.ENDTILE).padStart(3, '0')) ends++;
			if (id !== '000' && !knownblocks.has(id))
				unknownblocks.add(id);
		}
	for (const id of unknownblocks)
		w.push('block id ' + id + ' is not in this build\'s catalog');

	const players = l.entities.filter(s => s.def === cat.PLAYER_DEF).length;
	if (players === 0)
		w.push('no player placed (the spawn point is required)');
	else if (players > 1)
		w.push(players + ' player entities placed; only one is allowed');

	if (ends === 0)
		w.push('no end block placed (tile ' + cat.ENDTILE + ' is required)');
	else if (ends > 1)
		w.push(ends + ' end blocks placed; tile ' + cat.ENDTILE + ' must be unique');

	for (const d of l.entity_definitions)
		if (d.script.startsWith('scripts/') && doc.scripts[d.script] === undefined)
			w.push('definition "' + d.id + '" points at missing script ' + d.script);

	const sz = cat.pngsize(doc.sheet);
	for (const d of l.entity_definitions) {
		if (d.sheet !== 'custom')
			continue;
		if (!sz)
			w.push('definition "' + d.id + '" uses the custom sheet, but the level has none');
		else if ((d.row + 1) * d.frame > sz.h)
			w.push('definition "' + d.id + '" row ' + d.row + ' lies outside sheet.png');
		else
			/* A row holds width / frame frames: derived here, never stored. */
			for (const [name, a] of Object.entries(d.animations || {}))
				if (a.start + a.frames > Math.floor(sz.w / d.frame))
					w.push('animation "' + name + '" of "' + d.id + '" runs past the end of its row');
	}
	if (sz && !l.entity_definitions.some(d => d.sheet === 'custom'))
		w.push('sheet.png is not used by any definition');

	const h = l.block_data.length;
	const used = new Set();
	const cells = new Map();
	l.entities.forEach((s, n) => {
		used.add(s.def);
		if (!Array.isArray(s.pos) || s.pos.length !== 2)
			return;			/* validate() already reports this shape error */
		const [x, y] = s.pos;
		if (x < 0 || y < 0 || x >= cat.W * cat.B || y >= h * cat.B)
			w.push('entities[' + n + '] ("' + s.def + '") is outside the level bounds');
		/* An entity covers size / SPRITEPX cells on each side, from its pos's cell. */
		const c0 = Math.floor(x / cat.B), r0 = Math.floor(y / cat.B), span = s.size / cat.SPRITEPX;
		if (c0 + span > cat.W || r0 + span > h)
			w.push('entities[' + n + '] ("' + s.def + '") covers cells past the level bounds');
		let other = -1;
		for (let r = r0; r < r0 + span; r++)
			for (let c = c0; c < c0 + span; c++) {
				if (cells.has(c + ',' + r) && other < 0)
					other = cells.get(c + ',' + r);
				cells.set(c + ',' + r, n);
			}
		if (other >= 0)
			w.push('entities[' + n + '] ("' + s.def + '") shares a cell with entities[' + other + ']');
	});
	for (const d of l.entity_definitions)
		if (!used.has(d.id))
			w.push('definition "' + d.id + '" is not used by any entity, so it will not be saved');

	const usedscripts = new Set(l.entity_definitions.map(d => d.script));
	for (const p of Object.keys(doc.scripts))
		if (!usedscripts.has(p))
			w.push('script ' + p + ' is not referenced by any definition');

	return w;
}

/* Old levels stored one flat "data" array instead of rows, and predate the
 * entity and background fields.  Reshape in place so they still open. */
function migrate(j)
{
	const l = j && j.level;
	if (!l)
		return j;

	if (!Array.isArray(l.block_data) && Array.isArray(l.data)) {
		const rows = [];
		for (let n = 0; n < l.data.length; n += cat.W) {
			const r = l.data.slice(n, n + cat.W);
			while (r.length < cat.W)
				r.push('000');
			rows.push(r);
		}
		l.block_data = rows;
		delete l.data;
	}
	if (!Array.isArray(l.block_data) || !l.block_data.length)
		l.block_data = blockrows(cat.H);
	if (!l.information)
		l.information = {name: '', description: '', author: ''};
	if (!Array.isArray(l.entity_definitions))
		l.entity_definitions = [];
	if (!Array.isArray(l.entities))
		l.entities = [];
	if (!Array.isArray(l.backgrounds))
		l.backgrounds = [BG[0]];

	items(l);
	sprites(l);
	return j;
}

/* A definition written before sheets existed has no sprite fields; give it
 * its catalog row, or BLANKDEF's if the catalog does not know it.  Only
 * *missing* fields are filled - a malformed one is validate()'s to report. */
function sprites(l)
{
	for (const d of l.entity_definitions)
		if (d && typeof d === 'object' && d.sheet === undefined && d.row === undefined && d.frame === undefined)
			Object.assign(d, cat.spriteof(d.id));
}

/* A size belongs to each placed entity, on disk and in memory alike: it is how
 * big that one entity is drawn. A definition's frame is different - the edge
 * of one sprite cell in its sheet row - and is the only size a definition has.
 * On disk entity_definitions is an object keyed by id, each {script, sheet,
 * row, frame: [n, n], animations}; memory keeps the array of flat {id, script,
 * sheet, row, frame, animations} the renderer reads. A definition no entity
 * uses has nowhere to keep its animations or frame on disk, so write() leaves
 * it out. Entities write size as a [n, n] pair, the way they write pos.
 * A position is written in block cells, not world pixels: [0, 0] is the first
 * block of the first row. Memory keeps pixels, so posin() (below) is the
 * reverse. */
function sizesout(l)
{
	const used = new Set(l.entities.map(e => e.def));
	return {
		entity_definitions: Object.fromEntries(l.entity_definitions
			.filter(d => used.has(d.id))
			.map(d => [d.id, {script: d.script, sheet: d.sheet, row: d.row,
				frame: [d.frame, d.frame], ...(d.animations && {animations: d.animations})}])),
		entities: l.entities.map(e => ({
			...e,
			pos: e.pos.map(v => v / cat.B),
			size: [e.size, e.size]
		})),
	};
}

/* The reverse of sizesout()'s definition half. An array is a level written
 * before the object form, already in memory's shape, so it passes through.
 * Otherwise each key becomes an id. One written before frame existed keeps
 * its sheet and row under `sprite` and no frame: sizesin() gives it its
 * frame from its entities. A missing sprite stays undefined for sprites()
 * to fill from the catalog, as it does for any older definition.
 * Returns the frame errors, which read() reports with the rest. */
function defsin(l)
{
	const errs = [];
	const d = l.entity_definitions;
	if (!d || typeof d !== 'object' || Array.isArray(d))
		return errs;
	l.entity_definitions = Object.entries(d).map(([id, v]) => {
		const s = (v && v.sprite) || v || {};
		const f = v && v.frame;
		if (f !== undefined && (!Array.isArray(f) || f.length !== 2 || !Number.isInteger(f[0]) || f[0] < 1 || f[1] !== f[0]))
			errs.push('entity_definitions.' + id + '.frame must be [n, n] with n a positive integer');
		const def = {id, script: v && v.script, sheet: s.sheet, row: s.row};
		if (f)
			def.frame = f[0];
		if (v && v.animations)
			def.animations = v.animations;
		return def;
	});
	return errs;
}

/* The reverse of sizesout()'s position half: a disk pos is [col, row] in
 * block cells, and becomes world pixels here. Runs before migrate(), so the
 * pixels items() adds for a legacy level are never scaled a second time.
 * Any integer is accepted, out-of-bounds included - review() warns about
 * those, and refusing them here would leave a saved level unopenable. */
function posin(l)
{
	const errs = [];
	if (!Array.isArray(l.entities))
		return errs;
	l.entities.forEach((s, n) => {
		if (!s || !Array.isArray(s.pos) || s.pos.length !== 2)
			return;			/* validate() reports the shape error */
		if (!s.pos.every(Number.isInteger)) {
			errs.push('entities[' + n + '].pos must be [col, row] in whole blocks');
			return;
		}
		s.pos = s.pos.map(v => v * cat.B);
	});
	return errs;
}

/* The reverse of sizesout()'s entity half: each entity's [n, n] becomes its
 * size. An entity written without one (items() adds them) takes cat.ENTSIZE.
 * A definition written without a frame (before frame existed) takes its frame
 * from its first entity, since the size was all it ever had then.
 * ponytail: memory and the renderer are square-only (one edge per entity), so
 * a [w, h] with w !== h is refused here; lift that when grid.js draws
 * non-square cells. */
function sizesin(l)
{
	const defs = new Map(l.entity_definitions.filter(d => d).map(d => [d.id, d]));
	const errs = [];
	l.entities.forEach((s, n) => {
		if (!s)
			return;
		if (s.size === undefined) {
			s.size = cat.ENTSIZE;
			return;
		}
		const d = defs.get(s.def);
		const sz = s.size;
		if (!Array.isArray(sz) || sz.length !== 2 || !Number.isInteger(sz[0]) || sz[0] < cat.SPRITEPX || sz[0] % cat.SPRITEPX || sz[1] !== sz[0]) {
			errs.push('entities[' + n + '].size must be [n, n] with n a positive multiple of ' + cat.SPRITEPX);
			return;
		}
		s.size = sz[0];
		if (d && d.frame === undefined)
			d.frame = sz[0];
	});
	return errs;
}

/* Lift any leftover interactive tiles out of block_data and into entities. */
function items(l)
{
	const have = new Set(l.entity_definitions.map(d => d.id));

	for (let y = 0; y < l.block_data.length; y++) {
		const row = l.block_data[y];
		for (let x = 0; x < cat.W; x++) {
			const id = cat.ITEMTILE[+row[x]];
			if (!id)
				continue;
			row[x] = '000';
			if (!have.has(id)) {
				l.entity_definitions.push({
					id: id,
					script: cat.ITEMS.find(i => i.id === id).script
				});
				have.add(id);
			}
			l.entities.push({def: id, pos: [x * cat.B, y * cat.B]});
		}
	}
}

function blockrows(h)
{
	const rows = [];
	for (let y = 0; y < h; y++)
		rows.push(new Array(cat.W).fill('000'));
	return rows;
}

/* A document is what the renderer works on:
 *	json	 parsed level.json
 *	scripts	 {"scripts/foo.lua": "<text>"}
 *	midi	 {"midi/foo.mid": Uint8Array}
 *	sheet	 the archive's sheet.png as a Uint8Array, or null */
function blank()
{
	return {
		json: {
			level: {
				information: {name: 'untitled', description: '', author: ''},
				block_data: blockrows(cat.H),
				entity_definitions: [],
				entities: [],
				backgrounds: [BG[0]]
			}
		},
		scripts: {},
		midi: {},
		sheet: null
	};
}

function fail(what, errs)
{
	throw new Error(what + '\n\n' + errs.join('\n'));
}

function read(p)
{
	const buf = fs.readFileSync(p);
	let doc;

	if (buf[0] === 0x50 && buf[1] === 0x4b) {		/* "PK": a real archive */
		/* Named unzipped rather than zip - write() (below) imports fflate's
		 * own async zip() at module scope, and this would otherwise shadow
		 * it within this function only, which is exactly the kind of
		 * same-name-different-thing confusion worth avoiding even where it
		 * is not currently a bug. */
		const unzipped = unzipSync(buf);
		if (!unzipped['level.json'])
			throw new Error(p + ' contains no level.json');
		doc = {json: JSON.parse(strFromU8(unzipped['level.json'])), scripts: {}, midi: {}, sheet: null};
		for (const k in unzipped) {
			if (k.endsWith('/'))
				continue;
			if (k.startsWith('scripts/'))
				doc.scripts[k] = strFromU8(unzipped[k]);
			else if (k.startsWith('midi/'))
				doc.midi[k] = unzipped[k];
			else if (k === 'sheet.png')
				doc.sheet = unzipped[k];
		}
		if (doc.sheet && !cat.pngsize(doc.sheet))
			throw new Error('sheet.png in ' + p + ' is not a PNG');
	} else {						/* a bare level.json */
		doc = {json: JSON.parse(strFromU8(buf)), scripts: {}, midi: {}, sheet: null};
	}

	const lv = doc.json.level;
	if (lv && lv.scenes && typeof lv.scenes === 'object' && !Array.isArray(lv.scenes) && Object.keys(lv.scenes).length)
		unscenes(lv);
	const deferrs = lv ? defsin(lv) : [];
	const poserrs = lv ? posin(lv) : [];
	migrate(doc.json);
	const errs = deferrs.concat(poserrs, lv ? sizesin(lv) : [], validate(doc.json));
	if (errs.length)
		fail('invalid level.json in ' + p + ':', errs);
	return doc;
}

/* NAT-19/ARCH-09/PERF-06: measured before touching, per this file's own
 * "the synchronous code is simpler... measure, then convert if the
 * measurement justifies it" rule (POLISH.md). A 999-row save, isolated from
 * IPC and Grid.commit(), broke down as: JSON.stringify 11ms, zipSync 82ms,
 * writeFileSync under 2ms, validate() 6ms - ~104ms total, crossing the
 * ~100ms budget on this machine, and disk I/O was never the reason: it cost
 * under 2% of the total. zipSync's own compression is what blocks the main
 * process - confirmed by timing a 5ms setInterval against fflate's async
 * zip() over the same payload: the timer kept firing throughout (proof the
 * main thread stayed free), where it could not have during zipSync's own
 * synchronous call. So only the compression step moves - fs.writeFileSync/
 * renameSync stay exactly as they were, since fs.promises would not have
 * addressed the measured bottleneck at all. (A 999-row *read* measured 70ms
 * total, under the same threshold, so unzipSync is unconverted.) write()
 * now returns a Promise; every caller (main.js) already awaits it inside an
 * async handler. */
const ROWGROUP = 9;	/* block_data entries sharing one written line */

/* One block_data row, JSON.stringify's own indent=4 style would put each of
 * its 540 entries on its own line - thousands of lines per level, unreadable
 * in a diff. Grouped ROWGROUP to a line instead; the first group sits right
 * after the row's own '[' rather than alone on the next line, and every
 * later line hangs indented one column past it, under that first entry. */
function formatrow(row, indent, per = ROWGROUP)
{
	const cont = ' '.repeat(indent + 1);
	const groups = [];
	for (let i = 0; i < row.length; i += per)
		groups.push(row.slice(i, i + per).map(id => JSON.stringify(id)).join(', '));
	return '[' + groups.join(',\n' + cont) + ']';
}

/* JSON.stringify(doc.json, null, 4) for everything else, unchanged - only
 * block_data's rows and each entity's pos get a hand-built layout: a row
 * groups ROWGROUP to a line (formatrow(), above), and pos - always just
 * [x, y] - is kept on the one line entirely, the same way a hand-edited
 * level would write a coordinate pair rather than spreading it over three
 * lines. Both are stringified as placeholder markers first (so information/
 * entity_definitions/... keep exactly the formatting JSON.stringify already
 * gives them), then every marker is swapped for its own real text - reading
 * a row marker's own column back out of the stringified document is what
 * tells formatrow() how far to hang its continuation lines. */
function formatlevel(j)
{
	const sc = j.level.scenes;
	const keys = Object.keys(sc);
	const rowmarks = keys.map(k => '@@SCENE' + k + '@@');
	const ents = j.level.entities;
	const posmarks = ents.map((_, i) => '@@ENTPOS' + i + '@@');
	const sizemarks = ents.map((_, i) => '@@ENTSIZE' + i + '@@');
	const shim = {
		...j,
		level: {
			...j.level,
			scenes: Object.fromEntries(keys.map((k, i) => [k, rowmarks[i]])),
			entities: ents.map((e, i) => ({...e, pos: posmarks[i], ...(e.size && {size: sizemarks[i]})}))
		}
	};
	let s = JSON.stringify(shim, null, 4);

	keys.forEach((k, i) => {
		const token = '"' + rowmarks[i] + '"';
		const at = s.indexOf(token);
		const indent = at - s.lastIndexOf('\n', at) - 1;
		s = s.replace(token, formatrow(sc[k], indent, SCENECOLS));
	});
	ents.forEach((e, i) => {
		s = s.replace('"' + posmarks[i] + '"', '[' + e.pos.join(', ') + ']');
		if (e.size)
			s = s.replace('"' + sizemarks[i] + '"', '[' + e.size.join(', ') + ']');
	});
	return s;
}

/* On disk the grid is level.scenes, not block_data: an object keyed by scene
 * number (0-based), each value one scene's SCENECOLS-wide cells as a flat
 * row-major array (H rows x SCENECOLS, written SCENECOLS to a line). Only a
 * scene holding a block or an entity is written. In memory (and in Grid)
 * block_data stays the full W-wide grid; scenes()/unscenes() convert at the
 * file boundary only. */
const SCENECOLS = 20;
const NSCENES = cat.W / SCENECOLS;

function scenes(l)
{
	const live = new Set();
	for (const row of l.block_data)
		row.forEach((id, x) => { if (id !== '000') live.add(Math.floor(x / SCENECOLS)); });
	for (const e of l.entities)
		live.add(Math.min(NSCENES - 1, Math.max(0, Math.floor(e.pos[0] / cat.B / SCENECOLS))));
	const out = {};
	for (const n of [...live].sort((a, b) => a - b))
		out[n] = l.block_data.flatMap(row => row.slice(n * SCENECOLS, (n + 1) * SCENECOLS));
	return out;
}

function unscenes(l)
{
	const sc = l.scenes;
	const h = Math.max(...Object.values(sc).map(a => a.length / SCENECOLS));
	l.block_data = Array.from({length: h}, () => Array(cat.W).fill('000'));
	for (const n in sc)
		for (let y = 0; y * SCENECOLS < sc[n].length; y++)
			l.block_data[y].splice(n * SCENECOLS, SCENECOLS, ...sc[n].slice(y * SCENECOLS, (y + 1) * SCENECOLS));
	delete l.scenes;
}

/* information.level_hash is the content hash hashfiles() (below) computes.
 * Any copy already in the document is
 * dropped first, so re-saving never hashes a stale key. Returns a new json
 * object: doc.json itself is left alone, so Undo never sees the key. */
function withhash(j, hash)
{
	const info = {...j.level.information};
	delete info.level_hash;
	if (hash)
		info.level_hash = hash;
	return {...j, level: {...j.level, information: info}};
}

/* Every file the archive holds, by name: level.json laid out by formatlevel(),
 * then scripts, MIDI and the sheet as they are. */
function filesof(doc, json)
{
	const files = {'level.json': strToU8(formatlevel(json))};
	for (const k in doc.scripts)
		files[k] = strToU8(doc.scripts[k]);
	for (const k in doc.midi)
		files[k] = new Uint8Array(doc.midi[k]);
	if (doc.sheet)
		files['sheet.png'] = new Uint8Array(doc.sheet);
	return files;
}

/* The level_hash recipe, which any verifier must equate to: SHA-256 over every file sorted by name (directory
 * entries skipped), each fed as name, NUL, byte length, NUL, bytes. level.json
 * is fed as compact JSON.stringify() of its parse with level_hash removed, so
 * neither its layout nor the zip's timestamps and compression can change the
 * result, and a reader can recheck it from the unzipped files alone. */
function hashfiles(files)
{
	const h = crypto.createHash('sha256');
	for (const k of Object.keys(files).sort()) {
		if (k.endsWith('/'))
			continue;
		let data = files[k];
		if (k === 'level.json')
			data = strToU8(JSON.stringify(withhash(JSON.parse(strFromU8(data)), null)));
		h.update(k + '\0' + data.length + '\0');
		h.update(data);
	}
	return h.digest('hex');
}

function pack(files)
{
	return new Promise((resolve, reject) => {
		zip(files, {level: 6}, (err, data) => err ? reject(err) : resolve(data));
	});
}

async function write(p, doc)
{
	const errs = validate(doc.json);
	if (doc.sheet && !cat.pngsize(doc.sheet))
		errs.push('sheet.png is not a PNG');
	if (errs.length)
		fail('refusing to save an invalid level:', errs);

	const sc = scenes(doc.json.level);
	if (!Object.keys(sc).length)
		fail('refusing to save an empty level:', ['every scene is empty (no blocks or entities)']);
	const {information, backgrounds} = doc.json.level;
	const json = {...doc.json, level: {information, scenes: sc, ...sizesout(doc.json.level), backgrounds}};
	const hash = hashfiles(filesof(doc, json));
	const data = await pack(filesof(doc, withhash(json, hash)));

	/* Write to a temp file in the same directory, then rename over the
	 * target: rename(2) is atomic within one filesystem, so a crash or a
	 * full disk mid-write leaves the previous good file in place instead of
	 * a truncated one. */
	const tmp = p + '.tmp-' + process.pid;
	try {
		fs.writeFileSync(tmp, data);
		fs.renameSync(tmp, p);
	} catch (e) {
		try { fs.unlinkSync(tmp); } catch (_) { /* nothing to clean up */ }
		throw e;
	}
}

module.exports = {W: cat.W, H: cat.H, BG, blank, read, write, hashfiles, validate, migrate, review};
