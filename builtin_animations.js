/* builtin_animations.js - the frame offsets of the built-in animations, in the
 * spirit of a C header: a table the studio and the game both have to agree on.
 *
 * Read off textures/convert.py's own order, as it lays out sheets/entities.png.
 * Each folder is one row. Within a row the files directly in the folder come
 * first, then each subfolder in alphanumeric order (walk() sorts a parent
 * before its children), so an animation's frames always follow the regular
 * sprites. `start` is the frame index in the row, `frames` the count.
 *
 * Only chapeleira has an animation folder (enemies/chapeleira/walk/). Every
 * other built-in is a single regular sprite, frame 0 of its row. */
'use strict';

const BUILTIN_ANIMATIONS = {
	chapeleira: {walk: {start: 2, frames: 2}}
};

if (typeof module !== 'undefined' && module.exports)
	module.exports = {BUILTIN_ANIMATIONS};
