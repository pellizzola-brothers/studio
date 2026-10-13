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

/* PLACEHOLDER, tex and ready are consumed by grid.js and panel.js in the
 * renderer's shared global scope (CLAUDE.md), not by this file itself. */
/* exported PLACEHOLDER, tex, ready */

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

/* Interactives are entities, not tiles: they are dragged into place and carry a
 * script like any other entity.  The palette keeps them in their own group. */
const ITEMS = [
	{id: 'pizza', script: 'pizza_item', file: 'interactives/pizza.png'},
	{id: 'coin',  script: 'coin_item',  file: 'interactives/coin.png'},
	{id: 'soda',  script: 'soda_item',  file: 'interactives/energy_drink.png'}
];

/* They were tile ids 43-46 once.  Levels written back then are converted on
 * load, so the ids stay reserved and must not be handed to a block.  46 (star)
 * lost its sprite and entity, so it is no longer converted; review() flags it. */
const ITEMTILE = {43: 'pizza', 44: 'coin', 45: 'soda'};

/* Built-in entity definitions.  `script` is a bare name: the game resolves it
 * against its own script table.  Custom definitions instead carry a path into
 * the level's own scripts/ directory. */
const PLAYER_DEF = 'player';	/* singleton: at most one entity may ever use it */
const ENTS = [
	/* Each character/enemy is a directory of frames now; 00.png is the idle
	 * one.  characters/pellizola/ was leandro.png, the canonical player sprite
	 * (textures/ui/main_menu.png's own labelled callout).  The ids and scripts
	 * are the game's and predate the renames (erick was abu, tux pinguim), so
	 * only the files moved. */
	{id: PLAYER_DEF, script: 'player.lua', file: 'characters/pellizola/00.png'},
	{id: 'chapeleira', script: 'chapeleira_ai', file: 'enemies/chapeleira/00.png'},
	{id: 'abu',        script: 'abu_ai',        file: 'enemies/erick/00.png'},
	{id: 'pranta',     script: 'pranta_ai',     file: 'enemies/pranta/00.png'},
	{id: 'pinguim',    script: 'pinguim_ai',    file: 'enemies/tux/00.png'},
	{id: 'bullet',     script: 'bullet_ai',     file: 'enemies/bullet/00.png'}
];

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

/* lvl.js pulls the tables in from the main process; the renderer loads this as
 * a plain script and picks the same names up as globals. */
if (typeof module !== 'undefined' && module.exports)
	module.exports = {B, W, H, BLOCKS, ITEMS, ENTS, BGS, ITEMTILE, PLAYER_DEF};
