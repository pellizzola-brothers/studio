/* catalog.js - what the palette can paint and place.
 *
 * Block ids follow the contract documented in textures/README.md; the game
 * reads the same table, so an id may never be reused or renumbered here alone.
 *
 * Deliberately absent: blocks/lucky_block.png, gold, bronze and the
 * interactives/*_flag sprites were dropped from the texture library, as were
 * star.png and enemies/gombacrack*.png.  Nothing here may name a file
 * textures/ no longer ships. */
'use strict';

/* ENDTILE, PLACEHOLDER, BLANKDEF, tex, ready and the sheet helpers are
 * consumed by app.js, grid.js and panel.js in the renderer's shared global
 * scope (CLAUDE.md), not by this file itself. */
/* exported ENDTILE, PLACEHOLDER, BLANKDEF, tex, ready, sheetimage, artof, checksheets */

const B = 100;		/* world pixels per block; game/src/main.c draws 100x100 */
const W = 540;		/* entries per block_data row */
const H = 12;		/* rows in a fresh level - a product decision, not a format one */

const BLOCKS = [
	{id:  1, name: 'brick',                 file: 'blocks/bricks.png'},
	{id:  2, name: 'exclamation block',     file: 'blocks/normal_excla.png'},
	{id:  3, name: 'end sign',              file: 'blocks/end_level.png'},
	{id:  4, name: 'arrow',                 file: 'blocks/arrow_sign.png'},
	{id:  5, name: 'gravel',                file: 'blocks/cement.png'},
	{id:  6, name: 'diamond block',         file: 'blocks/diamond_block.png'},
	{id:  7, name: 'sponge',                file: 'blocks/esponja.png'},
	{id:  8, name: 'floor block',           file: 'blocks/floor_block.png'},
	{id:  9, name: 'frozen floor block',    file: 'blocks/frozen_floor_block.png'},
	{id: 10, name: 'ice exclamation block', file: 'blocks/ice_excla_block1.png'},
	{id: 11, name: 'ice floor block',       file: 'blocks/ice_floor_block.png'},
	{id: 12, name: 'note block',            file: 'blocks/note_block.png'},
	{id: 13, name: 'sand',                  file: 'blocks/sand.png'},
	{id: 14, name: 'silver block',          file: 'blocks/silver_block.png'},
	{id: 15, name: 'cloud',                 file: 'blocks/strange_cloud1.png'}
];

const ENDTILE = 3;	/* the unique goal block; review() in lvl.js and app.js count it */

/* Interactives are entities, not tiles: they are dragged into place and carry a
 * script like any other entity.  The palette keeps them in their own group. */
const ITEMS = [
	{id: 'pizza', script: 'pizza_item', file: 'interactives/pizza.png',      sheet: 'builtin', row: 7, frame: 32},
	{id: 'coin',  script: 'coin_item',  file: 'interactives/coin.png',       sheet: 'builtin', row: 5, frame: 32},
	{id: 'soda',  script: 'soda_item',  file: 'interactives/energy_drink.png', sheet: 'builtin', row: 6, frame: 32}
];

/* They were tile ids 43-46 once.  Levels written back then are converted on
 * load, so the ids stay reserved and must not be handed to a block.  46 (star)
 * lost its sprite and entity, so it is no longer converted; review() flags it. */
const ITEMTILE = {43: 'pizza', 44: 'coin', 45: 'soda'};

/* Built-in entity definitions.  `script` is a bare name: the game resolves it
 * against its own script table.  Custom definitions instead carry a path into
 * the level's own scripts/ directory. */
const PLAYER_DEF = 'player';	/* singleton: at most one entity may ever use it */
const SPRITEPX = 32;		/* the edge a block or entity sprite is authored at: drawn at B, or at its size / SPRITEPX of B */
const ENTSIZE = 32;		/* the edge, in sprite pixels, of a newly placed entity */

/* Where each built-in sprite sits in the sheets the game reads.  `row` is
 * the n-th run of non-transparent pixel rows in textures/sheets/entities.png
 * (top to bottom; sheetrows() below finds them), or 0 in player.png; `frame`
 * is the edge of that row's cell, the largest sprite in it.  Which row is
 * which entity is a contract, like a block id and its column in the block
 * sheet - pixels cannot say it - so checksheets() only *verifies* the table
 * against the real sheet.  Sprites are still drawn from `file`. */
const ENTS = [
	/* Each character/enemy is a directory of frames now; 00.png is the idle
	 * one.  characters/pellizzola/ was leandro.png, the canonical player sprite
	 * (textures/ui/main_menu.png's own labelled callout).  The ids and scripts
	 * are the game's and predate the renames (erick was abu, tux pinguim), so
	 * only the files moved. */
	{id: PLAYER_DEF, script: 'player.lua', file: 'characters/pellizzola/00.png', sheet: 'player',  row: 0, frame: 32},
	{id: 'chapeleira', script: 'chapeleira_ai', file: 'enemies/chapeleira/00.png', sheet: 'builtin', row: 1, frame: 32},
	{id: 'abu',        script: 'abu_ai',        file: 'enemies/erick/00.png',      sheet: 'builtin', row: 2, frame: 64},
	{id: 'pranta',     script: 'pranta_ai',     file: 'enemies/pranta/00.png',     sheet: 'builtin', row: 3, frame: 32},
	{id: 'pinguim',    script: 'pinguim_ai',    file: 'enemies/tux/00.png',        sheet: 'builtin', row: 4, frame: 32},
	{id: 'bullet',     script: 'bullet_ai',     file: 'enemies/bullet/00.png',     sheet: 'builtin', row: 0, frame: 32}
];

/* The three values a definition's `sheet` may take: the game's own entity
 * sheet, the player's sheet, or sheet.png at the root of the level's archive.
 * A custom sheet is composed by the studio (app.js's stitch()) so that
 * sprite (frame, row) of size s always sits at (frame * s, row * s). */
const SHEETKINDS = ['builtin', 'player', 'custom'];
const SHEETFILES = {builtin: 'sheets/entities.png', player: 'sheets/player.png'};
const BLANKDEF = 'pranta';	/* the art a new custom definition starts with */

/* The three presets the schema allows, mapped onto real backdrop art.  The
 * library ships a single backdrop now, so all three share it until more land. */
const BGS = [
	{id: 'foo', file: 'backdrops/00.png'},
	{id: 'bar', file: 'backdrops/00.png'},
	{id: 'baz', file: 'backdrops/00.png'}
];

/* icons/ is gone from the library; any real sprite will do for "no art". */
const PLACEHOLDER = 'characters/plant/00.png';

const tiles = new Map();	/* block id -> catalog entry */
for (const t of BLOCKS)
	tiles.set(t.id, t);

const entdefs = new Map();	/* definition id -> catalog entry */
for (const e of ENTS.concat(ITEMS))
	entdefs.set(e.id, e);

/* The {sheet, row, frame} a built-in definition is written with; anything
 * the catalog does not know gets BLANKDEF's, so no field is ever empty. */
function spriteof(id)
{
	const c = entdefs.get(id) || entdefs.get(BLANKDEF);
	return {sheet: c.sheet, row: c.row, frame: c.frame};
}

/* Width and height of a PNG from its IHDR chunk, or null if `b` is not one.
 * Enough to validate a sheet without decoding it. */
function pngsize(b)
{
	const sig = [137, 80, 78, 71, 13, 10, 26, 10];
	if (!b || b.length < 24 || sig.some((v, i) => b[i] !== v))
		return null;
	const u32 = i => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
	return {w: u32(16), h: u32(20)};
}

/* Encode each path segment, in case a name is not URL-safe. */
function texurl(file)
{
	return 'textures/' + file.split('/').map(encodeURIComponent).join('/');
}

const cache = new Map();

/* Images decode asynchronously; `redraw` fires once each one lands. */
function tex(file, redraw)
{
	let im = cache.get(file);
	if (im)
		return im;
	im = new Image();
	im.onload = im.onerror = redraw;
	im.src = texurl(file);
	cache.set(file, im);
	return im;
}

function ready(im) { return im && im.complete && im.naturalWidth > 0; }

/* The level's own sheet.png, decoded.  Keyed on the byte array itself, which
 * is replaced (never mutated) on import and by undo, so a changed sheet is
 * exactly a changed reference. */
let sheetcache = {bytes: null, url: null, im: null};

function sheetimage(bytes, redraw)
{
	if (!bytes)
		return null;
	if (sheetcache.bytes !== bytes) {
		if (sheetcache.url)
			URL.revokeObjectURL(sheetcache.url);
		const im = new Image();
		im.onload = redraw;
		sheetcache = {bytes: bytes, im: im,
			url: URL.createObjectURL(new Blob([bytes], {type: 'image/png'}))};
		im.src = sheetcache.url;
	}
	return sheetcache.im;
}

/* What to draw for definition `id`: a catalog entry (an individual file), or
 * {custom: def} for a slice of the level's sheet.png.  A custom definition
 * that points at a built-in row borrows that entry's file; art the catalog
 * has no file for is PLACEHOLDER. */
function artof(id, defs)
{
	const c = entdefs.get(id);
	if (c)
		return c;
	const d = defs.find(v => v.id === id);
	if (d && d.sheet === 'custom')
		return {custom: d};
	return (d && ENTS.concat(ITEMS).find(e => e.sheet === d.sheet && e.row === d.row)) ||
		{file: PLACEHOLDER};
}

/* The rows of a decoded sheet: each run of pixel rows holding anything
 * non-transparent, top to bottom, as {y, h}. */
function sheetrows(im)
{
	const w = im.naturalWidth, h = im.naturalHeight;
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	const g = c.getContext('2d', {willReadFrequently: true});
	g.drawImage(im, 0, 0);
	const px = g.getImageData(0, 0, w, h).data;
	const rows = [];
	let start = -1;

	for (let y = 0; y <= h; y++) {
		let any = false;
		for (let x = 0; y < h && x < w && !any; x++)
			any = px[(y * w + x) * 4 + 3] !== 0;
		if (any && start < 0)
			start = y;
		else if (!any && start >= 0) {
			rows.push({y: start, h: y - start});
			start = -1;
		}
	}
	return rows;
}

/* Reads each built-in sheet and checks the rows ENTS/ITEMS claim against it:
 * as many rows as the table names, each no taller than its `frame`.  Resolves
 * to a list of problems, empty when the table and the sheets agree. */
async function checksheets()
{
	const out = [];

	for (const kind of Object.keys(SHEETFILES)) {
		const im = new Image();
		im.src = texurl(SHEETFILES[kind]);
		try {
			await im.decode();
		} catch (e) {
			out.push(SHEETFILES[kind] + ' did not load');
			continue;
		}
		const want = ENTS.concat(ITEMS).filter(e => e.sheet === kind);
		const rows = sheetrows(im);
		const named = Math.max(...want.map(e => e.row)) + 1;
		if (rows.length !== named)
			out.push(SHEETFILES[kind] + ' has ' + rows.length + ' rows, catalog.js names ' + named);
		for (const e of want)
			if (!rows[e.row] || rows[e.row].h > e.frame)
				out.push(e.id + ': row ' + e.row + ' of ' + SHEETFILES[kind] + ' does not fit ' + e.frame + 'px');
	}
	return out;
}

/* lvl.js pulls the tables in from the main process; the renderer loads this as
 * a plain script and picks the same names up as globals. */
if (typeof module !== 'undefined' && module.exports)
	module.exports = {B, W, H, BLOCKS, ITEMS, ENTS, BGS, ITEMTILE, ENDTILE, PLAYER_DEF, ENTSIZE, SPRITEPX,
		SHEETKINDS, spriteof, pngsize};
