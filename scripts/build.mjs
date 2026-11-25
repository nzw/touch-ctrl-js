// src/touch-ctrl.js（ES module）から、<script> で読める UMD 版を作る。依存なし。
// node scripts/build.mjs          dist/ を書き出す
// node scripts/build.mjs --check  dist/ が src と食い違っていたら失敗する
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = readFileSync(root + 'src/touch-ctrl.js', 'utf8');
const EXPORT = 'export default TouchCtrl;';
if (!src.trimEnd().endsWith(EXPORT)) throw new Error('src must end with: ' + EXPORT);

const body = src.trimEnd().slice(0, -EXPORT.length).trimEnd();
const indented = body.split('\n').map(l => (l ? '\t' + l : l)).join('\n');
const umd = `(function (root, factory) {
	if (typeof define === 'function' && define.amd) define([], factory);
	else if (typeof module === 'object' && module.exports) module.exports = factory();
	else root.TouchCtrl = factory();
})(typeof self !== 'undefined' ? self : this, function () {
	'use strict';
${indented}

	return TouchCtrl;
});
`;

const out = root + 'dist/touch-ctrl.umd.js';
if (process.argv.includes('--check')) {
	let current = '';
	try { current = readFileSync(out, 'utf8'); } catch {}
	if (current !== umd) {
		console.error('dist/touch-ctrl.umd.js is out of date. Run: npm run build');
		process.exit(1);
	}
	console.log('dist is up to date');
} else {
	mkdirSync(root + 'dist', { recursive: true });
	writeFileSync(out, umd);
	// ルートは "type": "module" なので、dist の .js は CommonJS として読ませる
	writeFileSync(root + 'dist/package.json', '{\n  "type": "commonjs"\n}\n');
	console.log('wrote dist/touch-ctrl.umd.js');
}
