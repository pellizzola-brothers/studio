/* panel.js - the palette (top right) and the property inspector (bottom right).
 *
 * The inspector shows exactly one thing, chosen by what is selected: an entity
 * on the canvas, a custom definition in the palette, or the level itself. */
'use strict';

/* UX-11: showsettings is view state for #props, not canvas selection state -
 * it has to survive a click on the canvas underneath it (the user is still
 * looking at Settings until they say otherwise), which is exactly why it is
 * checked first in Panel.inspect(), below, ahead of Grid.sel/Grid.tool. */
const Panel = {showsettings: false};

/* VIS-11: the two icons a dynamically-built element still needs (the palette's
 * add-definition "+" and a tab's own close "x" - everything else the icon set
 * covers is static markup in index.html). `d` is one or more SVG path data
 * strings; the shared .icon/.icon.fill classes (style.css) own colour and
 * size, so nothing here is a presentation attribute. */
function svgicon(fill, d)
{
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

	svg.setAttribute('viewBox', '0 0 16 16');
	svg.setAttribute('class', fill ? 'icon fill' : 'icon');
	svg.setAttribute('aria-hidden', 'true');
	const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	p.setAttribute('d', d);
	svg.appendChild(p);
	return svg;
}

/* A11Y-01: roving tabindex for a list of focusable items sharing one Tab
 * stop - exactly one carries tabindex 0 (the current item, if any, else the
 * first), the rest -1, and the arrow keys move both the tab stop and focus.
 * `cols` is the row length for a 2D grid (the palette); 1 for a plain list
 * or a horizontal strip, where up/down and left/right end up equivalent,
 * which is harmless. Shared by the palette (panel.js), and the file lists
 * and tab strip (app.js). */
function roving(container, items, cols)
{
	for (const el of items)
		el.tabIndex = -1;
	const cur = items.find(el => el.classList.contains('on')) || items[0];
	if (cur)
		cur.tabIndex = 0;

	container.onkeydown = e => {
		const i = items.indexOf(document.activeElement);
		if (i < 0)
			return;
		let j;
		if (e.key === 'ArrowRight') j = i + 1;
		else if (e.key === 'ArrowLeft') j = i - 1;
		else if (e.key === 'ArrowDown') j = i + cols;
		else if (e.key === 'ArrowUp') j = i - cols;
		else if (e.key === 'Home') j = 0;
		else if (e.key === 'End') j = items.length - 1;
		else return;
		e.preventDefault();
		if (j < 0 || j >= items.length)
			return;
		items[i].tabIndex = -1;
		items[j].tabIndex = 0;
		items[j].focus();
	};
}

/* Definitions the level carries that the catalog does not know about. */
function customdefs()
{
	return App.doc.json.level.entity_definitions.filter(d => !entdefs.has(d.id));
}

/* The roving-tabindex helper needs the palette's row length to move focus
 * up/down a grid that CSS alone lays out. GEO-07 made the column count
 * itself a function of the panel's width (repeat(auto-fill, var(--cell))),
 * so a fixed PALCOLS constant would go stale the moment the panel resized -
 * read it back from the grid's own resolved column list instead, which is
 * exactly as many columns as are actually on screen. */
function palcols(el)
{
	return getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
}

/* UX-07: matched case-insensitively against each cell's own display name -
 * the same string its title/aria-label already show - not the raw catalog
 * id, so "brick" finds the brick block the same way its own tooltip names
 * it. An empty query matches everything, so the unfiltered palette is just
 * this same code path with `q` empty rather than a separate one. */
function palettematch(name)
{
	const q = $('palette-filter').value.trim().toLowerCase();
	return !q || name.toLowerCase().includes(q);
}

Panel.palette = function ()
{
	const el = $('palette');
	el.innerHTML = '';
	el.setAttribute('role', 'group');
	/* A11Y-02: the "items" <h2> (index.html) is the visible label; pointing
	 * at it beats a second string ("palette") nobody sees. */
	el.setAttribute('aria-labelledby', 'hdr-items');
	const items = [];

	group(el, items, 'blocks', [
		['block', 0, 'air (eraser)', null],
		...BLOCKS.map(t => ['block', t.id, t.name, t.file])
	]);
	group(el, items, 'items', ITEMS.map(t => ['entity', t.id, t.id, t.file]));
	group(el, items, 'entities', [
		...ENTS.map(e => ['entity', e.id, e.id, e.file]),
		...customdefs().map(d => ['entity', d.id, d.id + ' (custom)',
			artof(d.id, App.doc.json.level.entity_definitions)])
	]);

	const add = document.createElement('button');
	add.type = 'button';
	add.className = 'cell add';
	add.appendChild(svgicon(false, 'M8 3v10M3 8h10'));
	add.title = 'new custom entity definition';
	add.setAttribute('aria-label', 'new custom entity definition');
	add.onclick = newdef;
	el.appendChild(add);
	items.push(add);

	roving(el, items, palcols(el));
	App.tool(toolname());
};

/* UX-06: the same display name each palette cell already uses for its own
 * title/aria-label - block 0 is "air (eraser)", a plain block is its own
 * catalog name, and an entity or item is its own id, "(custom)" appended
 * for a definition the catalog does not know about (customdefs(), above). */
function toolname()
{
	const t = Grid.tool;

	if (t.kind === 'block')
		return t.id === 0 ? 'air (eraser)' : ((tiles.get(t.id) || {}).name || 'unknown');
	return entdefs.has(t.id) ? t.id : t.id + ' (custom)';
}

/* UX-07: `entries` is [kind, id, name, file] per cell; the whole group -
 * heading included - disappears rather than showing an empty label when a
 * filter leaves nothing in it, so a query narrows the palette instead of
 * just greying parts of it out. */
function group(parent, items, name, entries)
{
	const matching = entries.filter(e => palettematch(e[2]));
	if (!matching.length)
		return;

	const g = document.createElement('div');
	g.className = 'grp';
	g.textContent = name;
	parent.appendChild(g);
	for (const [kind, id, cellname, file] of matching)
		items.push(cell(parent, kind, id, cellname, file));
}

/* The first frame of a custom definition's row, as a data URL - or '' while
 * sheet.png is still decoding or lacks the row (sheetimage() repaints the
 * palette once it lands). */
function sliceurl(d)
{
	const im = sheetimage(App.doc.sheet, () => { Panel.palette(); Grid.redraw(); });
	if (!ready(im))
		return '';
	const c = document.createElement('canvas');
	c.width = c.height = d.frame;
	c.getContext('2d').drawImage(im, 0, d.row * d.frame, d.frame, d.frame, 0, 0, d.frame, d.frame);
	return c.toDataURL();
}

/* A11Y-01: a real <button> rather than a clickable <div> - Enter/Space
 * activate it for free, and it is reachable through the roving-tabindex
 * group roving() sets up over Panel.palette()'s full return value. */
function cell(parent, kind, id, name, file)
{
	const c = document.createElement('button');
	const on = Grid.tool.kind === kind && Grid.tool.id === id;

	c.type = 'button';
	c.className = 'cell' + (file ? '' : ' air') + (on ? ' on' : '');
	c.title = name;
	c.setAttribute('aria-label', name);
	c.setAttribute('aria-pressed', on ? 'true' : 'false');
	const src = file && (file.custom ? sliceurl(file.custom) : texurl(file.file || file));
	if (src)
		c.style.backgroundImage = 'url("' + src + '")';
	/* A definition the catalog does not own can be removed from here: the
	 * menu is native (main.js, 'menu:row'), and chooses back through
	 * 'rowcmd' -> Panel.removedef(). */
	if (kind === 'entity' && !entdefs.has(id))
		c.oncontextmenu = ev => {
			ev.preventDefault();
			api.rowmenu({kind: 'def', key: id,
				count: App.doc.json.level.entities.filter(e => e.def === id).length});
		};
	c.onclick = () => {
		Grid.tool = {kind: kind, id: id};
		Grid.sel = -1;
		Panel.palette();
		Panel.inspect();
		Grid.redraw();
		Grid.cursor(Grid.hov);
	};
	parent.appendChild(c);
	return c;
}

/* A custom definition needs a script to point at - an empty one fails
 * validation on the game's side (lvl.js requires a non-empty string), so
 * "leave it unassigned" is not a state the schema can represent.
 *
 * UX-14: always its own fresh script now, rather than whichever existing one
 * happened to come first out of Object.keys(App.doc.scripts) - silently
 * binding a brand new entity kind to an unrelated script it did not choose
 * was the actual complaint, not the fact that *some* script gets created.
 * App.newscript() call is outside the Undo.act() below rather than nested in
 * it: Undo.begin()/end() are not reentrant (a nested begin() joins the open
 * step, but the inner call's own end() would still close it early), so this
 * lands as two undo steps - the same pattern the previous, sometimes-taken
 * "create a script" branch already used. */
function newdef()
{
	const defs = App.doc.json.level.entity_definitions;
	let n = 1;
	while (defs.some(d => d.id === 'custom_' + n))
		n++;

	const id = 'custom_' + n;
	const script = App.newscript(id + '.lua');

	Undo.act(() => {
		defs.push({id: id, script: script, ...spriteof(BLANKDEF)});
		/* Whatever was selected on the canvas before is not what "+" was
		 * about - without this, Panel.inspect() below would keep showing
		 * that entity instead of the definition just created. */
		Grid.sel = -1;
		Grid.tool = {kind: 'entity', id: id};
		App.touch();
	}, 'new definition');
	Panel.palette();
	Panel.inspect();
	App.say('created ' + id + ' with ' + script);
}

/* PERF-01: onmove()'s entity-drag branch used to call the full Panel.inspect()
 * on every cell the entity crossed - a fresh ~1KB innerHTML string, plus two
 * rebuilt <select> elements, several dozen times a second.  While the shape
 * of the entity view is unchanged (still the same entity, still selected),
 * only its position fields actually move, so a drag can write straight into
 * the three fields that hold it instead.  Returns false, doing nothing, if
 * the inspector is not currently showing an entityview() for this drag - the
 * caller falls back to a full Panel.inspect() in that case (ARCH-04). */
Panel.update = function (e)
{
	const x = $('p_x'), y = $('p_y'), cell = $('p_cell');
	if (!x || !y || !cell)
		return false;
	x.value = e.pos[0];
	y.value = e.pos[1];
	cell.value = Math.floor(e.pos[0] / B) + ', ' + Math.floor(e.pos[1] / B);
	return true;
};

/* ARCH-04: every rebuild below replaces #props's own subtree wholesale, so a
 * field the user is mid-edit in (p_def, p_id, the p_script/p_bg selects) is
 * destroyed and a new, unfocused element takes its place - Tab or
 * a screen reader loses its position entirely, not just the caret.  Saving
 * which field (by id) held focus before the rebuild and restoring it after
 * fixes every onchange call site at once, rather than patching each by hand;
 * a text field's own selection range is restored too, so it is only the
 * caret's *position*, not the caret itself, that a rebuild can still move. */
function savefocus(p)
{
	const el = document.activeElement;
	if (!el || !p.contains(el) || !el.id)
		return null;
	const r = {id: el.id};
	if (typeof el.selectionStart === 'number') {
		r.start = el.selectionStart;
		r.end = el.selectionEnd;
	}
	return r;
}

function restorefocus(p, r)
{
	if (!r)
		return;
	const el = $(r.id);
	if (!el)
		return;
	el.focus();
	if (r.start != null && typeof el.setSelectionRange === 'function')
		el.setSelectionRange(r.start, r.end);
}

Panel.inspect = function ()
{
	const p = $('props');
	const es = App.doc.json.level.entities;
	const focus = savefocus(p);

	if (Panel.showsettings)
		settingsview(p);
	else if (Grid.sel >= 0 && es[Grid.sel])
		entityview(p, es[Grid.sel]);
	else if (Grid.tool.kind === 'entity' && !entdefs.has(Grid.tool.id))
		defview(p, Grid.tool.id);
	else
		levelview(p);
	restorefocus(p, focus);
};

/* UX-11: the fourth #props view - not chosen by canvas selection like the
 * other three, but by the Settings command (ACTS.settings, app.js) until
 * "done" clears Panel.showsettings again. setsetting() applies each
 * control's own live effect immediately (applysettings(), app.js) and
 * persists the whole object in one round trip, rather than one channel per
 * field - four settings do not need four channels. */
function setsetting(key, value)
{
	Settings[key] = value;
	applysettings();
	call(api.setsettings(Settings));	/* ARCH-06: fire-and-forget through the one envelope every invoke() answers */
}

function settingsview(p)
{
	p.innerHTML =
		'<h4>settings</h4>' +
		'<label><input id="p_grid" type="checkbox"' + (Settings.grid ? ' checked' : '') +
			'> grid overlay</label>' +
		'<label>palette cell size<select id="p_cellsize">' +
			'<option value="1"' + (Settings.cellsize === 1 ? ' selected' : '') + '>1x</option>' +
			'<option value="2"' + (Settings.cellsize === 2 ? ' selected' : '') + '>2x</option>' +
		'</select></label>' +
		'<label>editor font size<input id="p_editorfontsize" type="number" min="8" max="32" value="' +
			Settings.editorfontsize + '"></label>' +
		'<label>recovery snapshot interval (seconds)<input id="p_snapshotinterval" type="number" min="5" max="600" value="' +
			Settings.snapshotinterval + '"></label>' +
		'<button class="act" id="p_settings_done">done</button>';

	$('p_grid').onchange = e => setsetting('grid', e.target.checked);
	$('p_cellsize').onchange = e => setsetting('cellsize', +e.target.value);
	$('p_editorfontsize').onchange = e => setsetting('editorfontsize',
		Math.min(32, Math.max(8, +e.target.value)));
	$('p_snapshotinterval').onchange = e => setsetting('snapshotinterval',
		Math.min(600, Math.max(5, +e.target.value)));
	$('p_settings_done').onclick = () => {
		Panel.showsettings = false;
		Panel.inspect();
		App.syncmenu();		/* undocontext() (app.js) reads this back in */
	};
}

function levelview(p)
{
	const l = App.doc.json.level;
	const i = l.information;

	p.innerHTML =
		'<h4>level</h4>' +
		'<label>name<input id="p_name" value="' + esc(i.name) + '"></label>' +
		'<label>description<textarea id="p_desc">' + esc(i.description) + '</textarea></label>' +
		'<label>author<input id="p_auth" value="' + esc(i.author) + '"></label>' +
		'<h4>background</h4>' +
		'<select id="p_bg">' + BGS.map(b => '<option' +
			(l.backgrounds[0] === b.id ? ' selected' : '') + '>' +
			esc(b.id) + '</option>').join('') + '</select>' +
		/* Both dimensions are fixed - B/W/H (catalog.js) are a cross-repo
		 * contract with the game (CLAUDE.md), not a per-level choice, so
		 * rows reads the same way width already did rather than offering an
		 * edit the game could never honour. */
		'<h4>size</h4>' +
		'<div class="row">' +
			'<label>width<input value="' + W + '" disabled aria-disabled="true"></label>' +
			'<label>rows<input value="' + Grid.h + '" disabled aria-disabled="true"></label>' +
		'</div>' +
		'<button class="act" id="p_fit">fit view</button>';

	bind('p_name', v => { i.name = v; App.retitle(); }, 'rename level');
	bind('p_desc', v => { i.description = v; }, 'edit description');
	bind('p_auth', v => { i.author = v; }, 'edit author');
	$('p_bg').onchange = e => Undo.act(() => {
		l.backgrounds = [e.target.value];
		App.touch();
		Grid.redraw();
	}, 'change background');
	$('p_fit').onclick = Grid.fit;
}

function entityview(p, e)
{
	const defs = App.doc.json.level.entity_definitions;
	const known = ENTS.concat(ITEMS).map(v => v.id)
		.concat(customdefs().map(d => d.id));

	if (!known.includes(e.def))		/* a def the catalog never knew */
		known.unshift(e.def);

	/* Items and entities are the same thing on disk and in every code path
	 * here (CLAUDE.md: "Interactives are entities, not tiles") - this is the
	 * one place that visually tells them apart, since the palette already
	 * keeps them in separate groups (ITEMS vs ENTS, palette() above) and a
	 * user who dragged a coin in from the "items" group should not read
	 * "entity" back at them. A custom definition (never in ITEMS) still
	 * reads "entity", unchanged. */
	const title = ITEMS.some(v => v.id === e.def) ? 'item' : 'entity';

	p.innerHTML =
		'<h4>' + title + '</h4>' +
		'<label>definition<select id="p_def">' + known.map(id =>
			'<option' + (id === e.def ? ' selected' : '') + '>' + esc(id) +
			'</option>').join('') + '</select></label>' +
		/* UX-17: x/y round silently to the nearest B on commit (the onchange
		 * handlers below) since entities snap to the grid (CLAUDE.md) - the
		 * label says so now, rather than a typed 137 turning into 100 with
		 * no explanation anywhere on screen. */
		'<div class="row">' +
			'<label>x (snaps to ' + B + ')<input id="p_x" type="number" step="' + B + '" value="' + e.pos[0] + '"></label>' +
			'<label>y (snaps to ' + B + ')<input id="p_y" type="number" step="' + B + '" value="' + e.pos[1] + '"></label>' +
		'</div>' +
		'<label>cell<input id="p_cell" value="' + Math.floor(e.pos[0] / B) + ', ' +
			Math.floor(e.pos[1] / B) + '" disabled aria-disabled="true"></label>' +
		'<label>size (px, whole cells)<input id="p_esize" type="number" min="' + SPRITEPX + '" step="' + SPRITEPX + '" value="' + e.size + '"></label>' +
		'<h4>script</h4>' +
		'<select id="p_script">' + scripts(e.def).map(v =>
			'<option' + (v === script(e.def) ? ' selected' : '') + '>' + esc(v) +
			'</option>').join('') + '</select>' +
		'<div class="hint">' + shared(e.def) + '</div>' +
		'<button class="act" id="p_del">remove entity</button>';

	$('p_def').onchange = ev => Undo.act(() => {
		const old = e.def;
		if (ev.target.value === PLAYER_DEF)
			unplaceplayer();
		e.def = ev.target.value;
		App.usedef(e.def);
		prunedef(old);
		App.touch();
		Grid.redraw();
		Panel.inspect();
	}, 'change entity definition');
	/* ARCH-04/PERF-01: Panel.update() over the full Panel.inspect() this used
	 * to call - the same field this handler's own onchange just fired from
	 * is exactly what a rebuild here would destroy mid-interaction (e.g.
	 * Tab from p_x straight into p_y), and PERF-01 already gave this drag
	 * hot path a helper that writes x/y/cell in place for precisely this. */
	for (const [id, n] of [['p_x', 0], ['p_y', 1]])
		$(id).onchange = ev => {
			const v = Math.round(+ev.target.value / B) * B;
			const to = n ? [e.pos[0], v] : [v, e.pos[1]];
			if (v === e.pos[n])
				return Panel.update(e);
			const why = blocked(to[0] / B, to[1] / B, Grid.sel);
			if (why) {
				App.say(why, true);
				return Panel.update(e);
			}
			Undo.act(() => {
				e.pos[n] = v;
				App.touch();
				Grid.redraw();
				Panel.update(e);
			}, 'move entity');
		};
	$('p_script').onchange = ev => Panel.assign(e.def, ev.target.value);
	$('p_esize').onchange = ev => {
		/* A size is whole cells: it snaps to SPRITEPX, and a size that would
		 * cover another entity is refused, like a move onto one. */
		const size = Math.max(1, Math.round(+ev.target.value / SPRITEPX)) * SPRITEPX;
		const why = blocked(e.pos[0] / B, e.pos[1] / B, Grid.sel, size);
		if (why) {
			App.say(why, true);
			return Panel.inspect();
		}
		Undo.act(() => {
			e.size = size;
			clearunder(e);
			App.touch();
			Grid.redraw();
			Panel.inspect();
		}, 'resize entity');
	};
	$('p_del').onclick = () => Undo.act(() => {
		App.doc.json.level.entities.splice(Grid.sel, 1);
		prunedef(e.def);
		Grid.sel = -1;
		App.touch();
		Grid.redraw();
		Panel.inspect();
	}, 'remove entity');

	function script(id)
	{
		const d = defs.find(v => v.id === id);
		return d ? d.script : '(unassigned)';
	}

	/* Everything the definition could point at: the built-in behaviour it
	 * ships with, plus every Lua file in this level. */
	function scripts(id)
	{
		const c = entdefs.get(id);
		const out = c ? [c.script] : [];

		for (const p of Object.keys(App.doc.scripts).sort())
			if (!out.includes(p))
				out.push(p);
		if (!out.includes(script(id)))
			out.unshift(script(id));
		return out;
	}

	function shared(id)
	{
		const n = App.doc.json.level.entities.filter(v => v.def === id).length;
		return n > 1 ? 'shared by ' + n + ' entities of this kind' :
			'used by this entity only';
	}
}

/* The script belongs to the definition, so assigning one moves every entity
 * of that kind.  Callers show which. */
Panel.assign = function (def, path)
{
	Undo.act(() => {
		const d = App.doc.json.level.entity_definitions.find(v => v.id === def);
		if (!d)
			return;
		d.script = path;
		App.touch();
	}, 'assign script');
	Panel.inspect();
	App.say(def + ' -> ' + path);
};

/* The inspector's sprite section for definition `d`: one select over every
 * built-in sprite plus "custom sheet", and row/frame fields once the custom
 * sheet is chosen.  A built-in row has no fields - the catalog owns them. */
function spritefields(d)
{
	const cat = ENTS.concat(ITEMS);
	const hit = cat.find(e => e.sheet === d.sheet && e.row === d.row);
	const custom = d.sheet === 'custom';
	let h = '<label>sprite<select id="p_sprite">' +
		(custom || hit ? '' : '<option selected disabled>' + esc(d.sheet) + ' row ' + d.row + '</option>') +
		cat.map(e => '<option value="' + esc(e.id) + '"' + (!custom && hit === e ? ' selected' : '') +
			'>' + esc(e.id) + '</option>').join('') +
		'<option value="@custom"' + (custom ? ' selected' : '') + (custom || App.doc.sheet ? '' : ' disabled') +
			'>custom sheet</option></select></label>';

	if (custom)
		h += '<div class="row">' +
			'<label>row<input id="p_row" type="number" min="0" step="1" value="' + d.row + '"></label>' +
			'<label>frame<input id="p_frame" type="number" min="1" step="1" value="' + d.frame + '"></label>' +
			'</div>';
	return h;
}

function defview(p, id)
{
	const defs = App.doc.json.level.entity_definitions;
	const d = defs.find(v => v.id === id);
	if (!d) {
		levelview(p);
		return;
	}
	const scripts = Object.keys(App.doc.scripts);

	p.innerHTML =
		'<h4>definition</h4>' +
		'<label>id<input id="p_id" value="' + esc(d.id) + '"></label>' +
		'<label>script<select id="p_script">' + scripts.map(s =>
			'<option' + (s === d.script ? ' selected' : '') + '>' + esc(s) +
			'</option>').join('') + '</select></label>' +
		spritefields(d) +
		'<button class="act" id="p_import">import sprite sheet…</button>' +
		(d.sheet === 'custom' ? animview(d) : '') +
		'<button class="act" id="p_rm">remove definition</button>';

	$('p_id').onchange = ev => Undo.act(() => {
		const v = ev.target.value.trim();
		if (!v || defs.some(x => x !== d && x.id === v) || entdefs.has(v)) {
			App.say('id must be non-empty and unused', true);
			Panel.inspect();
			return;
		}
		for (const e of App.doc.json.level.entities)
			if (e.def === d.id)
				e.def = v;
		d.id = v;
		Grid.tool = {kind: 'entity', id: v};
		App.touch();
		Panel.palette();
		Panel.inspect();
	}, 'rename definition');
	$('p_script').onchange = ev => Panel.assign(d.id, ev.target.value);
	$('p_import').onclick = () => App.importsheet(d.id);
	$('p_rm').onclick = () => Panel.removedef(d.id);

	/* One undo step per change, then everything that shows the art redraws. */
	function resprite(v, label)
	{
		Undo.act(() => {
			Object.assign(d, v);
			App.touch();
		}, label);
		Panel.palette();
		Panel.inspect();
		Grid.redraw();
	}
	$('p_sprite').onchange = ev => {
		const id = ev.target.value;
		if (id !== '@custom')
			return resprite(spriteof(id), 'change sprite');
		/* Whatever was imported last, else the sheet's own first cell: a
		 * square as tall as the sheet is wide would be a guess, so the
		 * user is left to type the row. */
		const last = App.lastsprite;
		resprite({sheet: 'custom', row: last ? last.row : 0, frame: last ? last.frame : (pngsize(App.doc.sheet) || {h: 32}).h}, 'change sprite');
	};
	if ($('p_row')) {
		$('p_row').onchange = ev => resprite({row: Math.max(0, Math.round(+ev.target.value) || 0)}, 'change sprite row');
		/* A frame is one cell of sheet.png, so it must fit inside it. */
		$('p_frame').onchange = ev => {
			const frame = Math.max(1, Math.round(+ev.target.value) || 1);
			const sz = pngsize(App.doc.sheet);
			if (!sz || frame > Math.min(sz.w, sz.h)) {
				App.say('a frame must fit inside sheet.png', true);
				return Panel.inspect();
			}
			resprite({frame: frame}, 'change sprite frame');
		};
	}
	if (d.sheet === 'custom')
		animbind(d);
}

/* The animation editor (below) works on a draft: Panel.draft holds the
 * definition being edited and its animations, each a name and the single-frame
 * PNGs it plays, until "apply" rebuilds the definition's row from them or
 * "cancel" drops them. Frames are {blob, url}: the blob is what apply stitches,
 * the url is what the inspector shows. Built-in definitions are not offered
 * it, since they have no row of their own to rebuild. */
Panel.draft = null;

/* Panel.draft's blob URLs are the only browser resource it holds, so every
 * path that ends a draft frees them here. */
Panel.animclose = function ()
{
	if (!Panel.draft)
		return;
	for (const a of Panel.draft.anims)
		for (const f of a.frames)
			URL.revokeObjectURL(f.url);
	Panel.draft = null;
};

/* Resolves to the level's sheet.png once it has decoded. A load listener, not
 * sheetimage()'s redraw callback: whichever caller created the image first owns
 * that callback, so a second caller would never hear it fire. */
function sheetloaded()
{
	return new Promise(res => {
		const im = sheetimage(App.doc.sheet, () => {});
		if (ready(im))
			res(im);
		else
			im.addEventListener('load', () => res(im), {once: true});
	});
}

/* Frame `col` of row `row` in a decoded sheet, cut out as a PNG blob. */
function cutframe(im, row, col, frame)
{
	const c = document.createElement('canvas');
	c.width = c.height = frame;
	c.getContext('2d').drawImage(im, col * frame, row * frame, frame, frame, 0, 0, frame, frame);
	return new Promise(res => c.toBlob(res, 'image/png'));
}

function framefrom(blob)
{
	return {blob: blob, url: URL.createObjectURL(blob)};
}

/* The inspector's animation section: a button to open the editor, or the
 * editor itself while Panel.draft is for this definition. */
function animview(d)
{
	if (!Panel.draft || Panel.draft.id !== d.id)
		return '<h4>animations</h4><button class="act" id="p_anim_open">edit animations…</button>';
	return '<h4>animations</h4><div id="p_anim">' + Panel.draft.anims.map((a, i) =>
		'<div class="anim">' +
			'<label>name<input data-name="' + i + '" value="' + esc(a.name) + '"></label>' +
			'<div class="frames">' + a.frames.map((f, j) =>
			'<button class="frame" data-rm="' + i + ',' + j + '" aria-label="remove frame ' + (j + 1) + '">' +
				'<img src="' + f.url + '" alt=""></button>').join('') + '</div>' +
			'<div class="acts">' +
				'<button class="act" data-add="' + i + '">add frames…</button>' +
				'<button class="act" data-rmanim="' + i + '">remove animation</button>' +
			'</div>' +
		'</div>').join('') +
		'<button class="act" id="p_anim_new">new animation</button>' +
		'<div class="acts">' +
			'<button class="act" id="p_anim_apply">apply</button>' +
			'<button class="act" id="p_anim_cancel">cancel</button>' +
		'</div></div>';
}

function animbind(d)
{
	if ($('p_anim_open')) {
		$('p_anim_open').onclick = () => Panel.animopen(d.id);
		return;
	}
	$('p_anim').onchange = ev => {
		if (ev.target.dataset.name !== undefined)
			Panel.draft.anims[+ev.target.dataset.name].name = ev.target.value;
	};
	$('p_anim').onclick = ev => {
		const t = ev.target.closest('button');
		if (!t)
			return;
		const anims = Panel.draft.anims;
		if (t.dataset.add !== undefined)
			return animadd(+t.dataset.add);
		if (t.dataset.rmanim !== undefined) {
			anims.splice(+t.dataset.rmanim, 1);
		} else if (t.dataset.rm !== undefined) {
			const [i, j] = t.dataset.rm.split(',').map(Number);
			URL.revokeObjectURL(anims[i].frames[j].url);
			anims[i].frames.splice(j, 1);
		}
		Panel.inspect();
	};
	$('p_anim_new').onclick = () => {
		Panel.draft.anims.push({name: 'animation ' + (Panel.draft.anims.length + 1), frames: []});
		Panel.inspect();
	};
	$('p_anim_apply').onclick = () => Panel.animapply();
	$('p_anim_cancel').onclick = () => {
		Panel.animclose();
		Panel.inspect();
	};
}

/* Reads each animation's frames back out of the row the definition points at,
 * so the draft starts from what is on the sheet. */
Panel.animopen = async function (id)
{
	const d = App.doc.json.level.entity_definitions.find(v => v.id === id);
	if (!App.doc.sheet) {
		App.say('import a sprite sheet before adding animations', true);
		return;
	}
	Panel.animclose();
	const im = await sheetloaded();
	const anims = [];
	for (const [name, a] of Object.entries(d.animations || {})) {
		const frames = [];
		for (let i = 0; i < a.frames; i++)
			frames.push(framefrom(await cutframe(im, d.row, a.start + i, d.frame)));
		anims.push({name: name, frames: frames});
	}
	Panel.draft = {id: id, anims: anims};
	Panel.inspect();
};

/* "add frames…": the sheet import dialog picks the PNGs.  Each file is one
 * frame, so each must be exactly the definition's frame square, or none are
 * added. */
async function animadd(i)
{
	const d = App.doc.json.level.entity_definitions.find(v => v.id === Panel.draft.id);
	const r = await call(api.sheet());
	if (!r)
		return;
	const bad = r.files.find(f => {
		const sz = pngsize(f.data);
		return !sz || sz.w !== d.frame || sz.h !== d.frame;
	});
	if (bad) {
		App.say(bad.name + ' is not ' + d.frame + ' × ' + d.frame + ' px', true);
		return;
	}
	Panel.draft.anims[i].frames.push(...r.files.map(f => framefrom(new Blob([f.data], {type: 'image/png'}))));
	Panel.inspect();
}

/* Frame `frame` px square, one canvas per row of `frame` px: the frames in
 * `blobs`, in order, drawn across one strip. */
async function framestrip(blobs, frame)
{
	const bms = await Promise.all(blobs.map(b => createImageBitmap(b.blob)));
	const c = document.createElement('canvas');
	c.width = frame * bms.length;
	c.height = frame;
	bms.forEach((bm, i) => c.getContext('2d').drawImage(bm, i * frame, 0));
	return c;
}

/* Row `row` of a decoded sheet, cut out full width as one strip `frame` px tall. */
function rowstrip(im, row, frame)
{
	const c = document.createElement('canvas');
	c.width = im.naturalWidth;
	c.height = frame;
	c.getContext('2d').drawImage(im, 0, row * frame, c.width, frame, 0, 0, c.width, frame);
	return c;
}

/* Packs strips into one sheet.png, each at the next multiple of its own height -
 * the placement stitch() uses - and returns the bytes with each strip's new row
 * index in order. */
async function packsheet(strips)
{
	let h = 0;
	const at = strips.map(s => {
		const y = Math.ceil(h / s.height) * s.height;
		h = y + s.height;
		return y;
	});
	const c = document.createElement('canvas');
	c.width = Math.max(...strips.map(s => s.width));
	c.height = h;
	strips.forEach((s, i) => c.getContext('2d').drawImage(s, 0, at[i]));
	const blob = await new Promise(res => c.toBlob(res, 'image/png'));
	return {bytes: new Uint8Array(await blob.arrayBuffer()), rows: strips.map((s, i) => at[i] / s.height)};
}

/* Rebuilds the definition's row from the draft: every frame of every animation,
 * in order, is one strip. sheet.png is then repacked from only the rows the
 * custom definitions still use (packsheet()), so the row it replaces is dropped
 * and every custom definition's row is remapped to where its strip now sits.
 * Definitions that share a row share its strip. The animations index into the
 * new strip. With no animations left, the definition keeps its row and only
 * the animations go. */
Panel.animapply = async function ()
{
	const draft = Panel.draft;
	const d = App.doc.json.level.entity_definitions.find(v => v.id === draft.id);
	const names = draft.anims.map(a => a.name.trim());
	if (names.some(n => !n) || new Set(names).size !== names.length) {
		App.say('every animation needs a unique name', true);
		return;
	}
	if (draft.anims.some(a => !a.frames.length)) {
		App.say('every animation needs at least one frame', true);
		return;
	}

	const custom = App.doc.json.level.entity_definitions.filter(v => v.sheet === 'custom');
	const im = await sheetloaded();
	const strips = [];
	const kept = new Map();		/* definition -> its strip's index */
	const slots = new Map();	/* "row:frame" -> the strip index it shares */
	if (draft.anims.length) {
		kept.set(d, strips.length);
		strips.push(await framestrip(draft.anims.flatMap(a => a.frames), d.frame));
	}
	for (const v of custom) {
		if (kept.has(v))
			continue;
		const key = v.row + ':' + v.frame;
		if (!slots.has(key)) {
			slots.set(key, strips.length);
			strips.push(rowstrip(im, v.row, v.frame));
		}
		kept.set(v, slots.get(key));
	}
	const packed = await packsheet(strips);

	Undo.act(() => {
		App.doc.sheet = packed.bytes;
		for (const v of custom)
			v.row = packed.rows[kept.get(v)];
		if (draft.anims.length) {
			d.animations = {};
			let start = 0;
			draft.anims.forEach((a, i) => {
				d.animations[names[i]] = {start: start, frames: a.frames.length};
				start += a.frames.length;
			});
		} else {
			delete d.animations;
		}
		/* The import shortcut remembers a row by index, and those have moved. */
		App.lastsprite = null;
		App.touch();
	}, 'edit animations');
	Panel.animclose();
	Panel.palette();
	Panel.inspect();
	Grid.redraw();
};

/* Removes definition `id` and every entity placed from it, as one undo step.
 * Reached from the inspector's "remove definition" button and from the
 * palette cell's right-click menu (cell(), above). */
Panel.removedef = function (id)
{
	const defs = App.doc.json.level.entity_definitions;
	const d = defs.find(v => v.id === id);
	if (!d)
		return;
	Panel.animclose();
	const es = App.doc.json.level.entities;
	let removed = 0;

	Undo.act(() => {
		for (let i = es.length - 1; i >= 0; i--)
			if (es[i].def === d.id) {
				es.splice(i, 1);
				removed++;
			}
		defs.splice(defs.indexOf(d), 1);
		Grid.tool = {kind: 'block', id: BLOCKS[0].id};
		Grid.sel = -1;
		App.touch();
	}, 'remove definition');
	Panel.palette();
	Panel.inspect();
	Grid.redraw();
	/* UX-08: undoable (Undo.act, above), but otherwise silent - clicking
	 * this was one click for what can be dozens of placed entities. */
	App.say('removed \'' + d.id + '\'' + (removed ?
		' and ' + removed + ' ' + (removed === 1 ? 'entity' : 'entities') +
			' · ' + (api.platform === 'darwin' ? '⌘Z' : 'Ctrl+Z') + ' to undo' :
		''));
};

/* Live-edit a text field without rebuilding the panel under the caret.  The
 * undo step spans the whole visit to the field, so typing a name undoes as a
 * name rather than as thirteen letters. */
function bind(id, set, label)
{
	const el = $(id);

	/* UX-03: wrapped rather than `el.onfocus = Undo.begin` directly - a DOM
	 * event handler is called with the Event as its first argument, which
	 * would otherwise become the step's label. */
	el.onfocus = () => Undo.begin(label);
	el.oninput = e => { set(e.target.value); App.touch(); };
	el.onblur = Undo.end;
}
