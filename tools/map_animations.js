/* tools/map_animations.js - maps the built-in sheets' rows, frames and animations
 * the way textures/convert.py lays them out, and writes builtin_animations.js
 * from that.
 *
 *   npm run map_animations            write builtin_animations.js
 *   npm run map_animations -- --check verify, write nothing; exit 1 on a mismatch
 *
 * The rules are convert.py's own:
 *  - each folder in its source list is one or more rows: a folder whose entries
 *    are all subfolders gives one row per subfolder, sorted; any other folder is
 *    one row;
 *  - a row's frames are the PNGs under it in walk order: a directory before its
 *    subdirectories, files sorted within each directory; a frame's x is the sum
 *    of the widths before it, and a row's y the sum of the heights of the rows
 *    before it.
 * Animations follow from those folders: the PNGs directly in a row are its
 * regular sprites, named idle when the row has any animation; each subfolder is
 * one animation, named after the folder, starting at its first frame. */
'use strict';

const fs = require('fs');
const path = require('path');
const cat = require('../catalog');
const {BUILTIN_ANIMATIONS} = require('../builtin_animations');

const ROOT = path.join(__dirname, '..');
const TEX = path.join(ROOT, 'textures');

/* The catalog id each texture folder's row is drawn for.  Plant is in the sheet
 * but not placed, so it has none. A folder missing from here is an error: a new
 * row has to be named before the catalog can use it. */
const IDS = {
	bullet: 'bullet', chapeleira: 'chapeleira', pranta: 'pranta',
	tux: 'pinguim', coin: 'coin', energy_drink: 'soda', pizza: 'pizza',
	plant: null, pellizzola: cat.PLAYER_DEF
};

/* convert.py's own source lists, read from the file so they cannot drift. */
function sources(name)
{
	const src = fs.readFileSync(path.join(TEX, 'convert.py'), 'utf8');
	const m = src.match(new RegExp('^' + name + ' = \\[([^\\]]*)\\]', 'm'));
	if (!m)
		throw new Error('convert.py has no ' + name + ' list');
	return [...m[1].matchAll(/"([^"]+)"/g)].map(x => path.join(TEX, x[1]));
}

const isdir = p => fs.statSync(p).isDirectory();

/* rows_of(): one folder per row, or the folder itself. */
function groupsOf(folder)
{
	const entries = fs.readdirSync(folder).filter(e => !e.startsWith('.')).sort();
	if (entries.length && entries.every(e => isdir(path.join(folder, e))))
		return entries.map(e => path.join(folder, e));
	return [folder];
}

/* convert.py's own skips (`if "erick" in path.join(root, file): continue`): a
 * file whose path holds one of these is not packed into any sheet. */
const SKIPS = [...fs.readFileSync(path.join(TEX, 'convert.py'), 'utf8')
	.matchAll(/if "([^"]+)" in path\.join\(root, file\)/g)].map(m => m[1]);

/* images(): every directory under `folder` in sorted order, each one's PNGs
 * sorted, as {file, dir}, minus the files convert.py skips. */
function framesOf(folder)
{
	const dirs = [];
	(function visit(d) {
		dirs.push(d);
		for (const e of fs.readdirSync(d).sort())
			if (isdir(path.join(d, e)))
				visit(path.join(d, e));
	})(folder);
	dirs.sort();
	const out = [];
	for (const d of dirs)
		for (const f of fs.readdirSync(d).filter(n => n.endsWith('.png')).sort()) {
			const file = path.join(d, f);
			if (!SKIPS.some(s => file.includes(s)))
				out.push({file: file, dir: d});
		}
	return out;
}

/* The rows a sheet is packed from, in convert.py's order, with every frame's
 * position in it. Frame sizes come from each PNG's header, as pngsize() reads. */
function layout(folders)
{
	const rows = [];
	let y = 0;
	for (const folder of folders)
		for (const group of groupsOf(folder)) {
			const frames = framesOf(group);
			if (!frames.length)
				continue;
			const sizes = frames.map(f => cat.pngsize(fs.readFileSync(f.file)));
			const h = Math.max(...sizes.map(s => s.h));
			let x = 0;
			frames.forEach((f, i) => {
				f.x = x;
				f.w = sizes[i].w;
				f.h = sizes[i].h;
				x += sizes[i].w;
			});
			rows.push({folder: group, y: y, h: h, w: x, frames: frames});
			y += h;
		}
	return rows;
}

/* One row's animations, in the order its folders are walked. Its regular
 * sprites (the PNGs directly in the row) are always `idle`, so a row with no
 * subfolders is idle too: its 00 sprite. */
function animationsOf(row)
{
	const anims = {};
	const named = {};
	let regular = 0;
	row.frames.forEach((f, i) => {
		const rel = path.relative(row.folder, f.dir);
		if (!rel) {
			regular++;
			return;
		}
		const name = rel.split(path.sep)[0];
		named[name] = named[name] || [];
		named[name].push(i);
	});
	if (regular)
		anims.idle = {start: 0, frames: regular};
	for (const name of Object.keys(named)) {
		const at = named[name];
		if (at.some((v, i) => i && v !== at[i - 1] + 1))
			throw new Error(path.basename(row.folder) + '/' + name + ' is not contiguous in its row');
		anims[name] = {start: at[0], frames: at.length};
	}
	return anims;
}

/* Every id's row and table entry, as the sheet and the catalog name them. */
function mapped()
{
	const sheets = {entities: layout(sources('entities')), player: layout(sources('player'))};
	const table = {};
	const rows = {};
	for (const kind of Object.keys(sheets))
		for (const row of sheets[kind]) {
			const key = path.basename(row.folder);
			if (!(key in IDS))
				throw new Error('no catalog id for texture folder "' + key + '"; add it to IDS');
			const id = IDS[key];
			if (!id)
				continue;
			rows[id] = {kind: kind, row: sheets[kind].indexOf(row), frame: row.h, folder: key};
			const anims = animationsOf(row);
			if (Object.keys(anims).length)
				table[id] = anims;
		}
	return {sheets: sheets, rows: rows, table: table};
}

const json = o => JSON.stringify(o);

function render(table)
{
	const ids = Object.keys(table);
	const body = ids.map(id => '\t' + id + ': {' + Object.keys(table[id]).map(n =>
		n + ': {start: ' + table[id][n].start + ', frames: ' + table[id][n].frames + '}').join(', ') + '}');
	return '/* builtin_animations.js - the frame offsets of the built-in animations, in the\n' +
		' * spirit of a C header: a table the studio and the game both have to agree on.\n' +
		' *\n' +
		' * GENERATED by tools/map_animations.js (npm run map_animations) from\n' +
		' * textures/convert.py\'s folder order. Do not edit by hand; change the\n' +
		' * textures, or the rules in the script, and regenerate. Each animation is\n' +
		' * named after its folder, and `start` is its frame index in the row. Every\n' +
		' * built-in is idle (its regular sprites, the 00 sprite); a folder with\n' +
		' * subfolders adds one animation per subfolder. */\n' +
		"'use strict';\n\n" +
		'const BUILTIN_ANIMATIONS = {\n' + body.join(',\n') + '\n};\n\n' +
		"if (typeof module !== 'undefined' && module.exports)\n\tmodule.exports = {BUILTIN_ANIMATIONS};\n";
}

/* Problems the textures and the catalog have with each other, or with the
 * committed table. Empty when everything agrees. */
function problems(m)
{
	const out = [];
	for (const e of cat.ENTS.concat(cat.ITEMS)) {
		if (e.sheet !== 'builtin' && e.sheet !== 'player')
			continue;
		const r = m.rows[e.id];
		if (!r)
			out.push(e.id + ': no folder in the ' + e.sheet + ' sheet');
		else if (r.kind !== (e.sheet === 'player' ? 'player' : 'entities') || r.row !== e.row || r.frame !== e.frame)
			out.push(e.id + ': catalog says row ' + e.row + ' frame ' + e.frame + ', textures say row ' + r.row + ' frame ' + r.frame);
	}
	for (const kind of ['entities', 'player']) {
		const file = path.join(ROOT, 'textures', 'sheets', kind + '.png');
		const rows = m.sheets[kind];
		const size = cat.pngsize(fs.readFileSync(file));
		const w = Math.max(...rows.map(r => r.w)), h = rows.reduce((a, r) => a + r.h, 0);
		if (!size || size.w !== w || size.h !== h)
			out.push(kind + '.png is ' + (size ? size.w + 'x' + size.h : 'unreadable') + ', textures say ' + w + 'x' + h);
	}
	for (const e of cat.ENTS.concat(cat.ITEMS))
		if (e.file && !fs.existsSync(path.join(TEX, e.file)))
			out.push(e.id + ': ' + e.file + ' is not in textures/');
	if (json(m.table) !== json(BUILTIN_ANIMATIONS))
		out.push('builtin_animations.js is out of date with the textures');
	return out;
}

function main()
{
	const check = process.argv.includes('--check');
	const m = mapped();
	const lines = [];
	for (const kind of ['entities', 'player'])
		for (const row of m.sheets[kind]) {
			lines.push(kind + ' row ' + m.sheets[kind].indexOf(row) + ' y=' + row.y + ' h=' + row.h + ' ' + path.relative(TEX, row.folder));
			for (const f of row.frames)
				lines.push('    x=' + f.x + ' ' + path.relative(TEX, f.file));
		}
	if (check) {
		const bad = problems(m);
		console.log(lines.join('\n'));
		if (bad.length) {
			console.log('\n' + bad.join('\n'));
			process.exit(1);
		}
		console.log('\nbuiltin_animations.js and the catalog agree with the textures');
		return;
	}
	fs.writeFileSync(path.join(ROOT, 'builtin_animations.js'), render(m.table));
	console.log(lines.join('\n'));
	console.log('\nwrote builtin_animations.js');
}

main();
