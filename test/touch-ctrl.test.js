import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import TouchCtrl from '../src/touch-ctrl.js';

// Node には PointerEvent と DOM 要素が無いので、EventTarget の上に最小限を組む
class FakePointerEvent extends Event {
	constructor(type, init = {}) {
		super(type);
		Object.assign(this, { pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: 0, clientY: 0 }, init);
	}
}

class FakeElement extends EventTarget {
	constructor(rect = { left: 100, top: 50, width: 300, height: 200 }) {
		super();
		this.rect = rect;
		this.style = { touchAction: '' };
		this.captured = new Set();
		this.listenerCount = 0;
	}
	addEventListener(type, fn, opts) { this.listenerCount++; super.addEventListener(type, fn, opts); }
	removeEventListener(type, fn, opts) { this.listenerCount--; super.removeEventListener(type, fn, opts); }
	getBoundingClientRect() { return { ...this.rect }; }
	setPointerCapture(id) { this.captured.add(id); }
	releasePointerCapture(id) { this.captured.delete(id); }
}

const fire = (el, type, init) => el.dispatchEvent(new FakePointerEvent(type, init));

function setup(options = {}) {
	const el = new FakeElement();
	const log = [];
	const rec = name => function (e, locate) { log.push({ name, e, locate, self: this }); };
	const ctrl = new TouchCtrl({
		target: el,
		callback: { start: rec('start'), move: rec('move'), end: rec('end'), cancel: rec('cancel') },
		...options
	});
	return { el, log, ctrl };
}

test('start → move → end を 1 回ずつ呼び、座標は target の左上が原点', () => {
	const { el, log, ctrl } = setup();
	fire(el, 'pointerdown', { clientX: 110, clientY: 60 });
	fire(el, 'pointermove', { clientX: 130, clientY: 60 });
	fire(el, 'pointerup', { clientX: 130, clientY: 60 });
	assert.deepEqual(log.map(l => l.name), ['start', 'move', 'end']);
	assert.equal(log[0].locate.x, 10);
	assert.equal(log[0].locate.y, 10);
	assert.equal(log[1].locate.dx, 20);
	assert.equal(log[1].self, ctrl, 'this はインスタンス');
	assert.equal(ctrl.active, false);
	assert.equal(ctrl.locate, null);
});

test('何度押しても move が重複して呼ばれない（v1 のリスナー漏れ）', () => {
	const { el, log } = setup();
	for (let i = 0; i < 5; i++) {
		fire(el, 'pointerdown', { clientX: 110, clientY: 60 });
		fire(el, 'pointerup', { clientX: 110, clientY: 60 });
	}
	log.length = 0;
	fire(el, 'pointerdown', { clientX: 110, clientY: 60 });
	fire(el, 'pointermove', { clientX: 150, clientY: 60 });
	assert.equal(log.filter(l => l.name === 'move').length, 1);
	// 離したあとの move は届かない
	fire(el, 'pointerup', { clientX: 150, clientY: 60 });
	fire(el, 'pointermove', { clientX: 200, clientY: 60 });
	assert.equal(log.filter(l => l.name === 'move').length, 1);
});

test('向きは動いた方向だけが true（v1 は左右・上下が逆だった）', () => {
	const { el, log } = setup({ fluctuation: 1 });
	fire(el, 'pointerdown', { clientX: 200, clientY: 150 });
	fire(el, 'pointermove', { clientX: 220, clientY: 150 }); // 右
	fire(el, 'pointermove', { clientX: 220, clientY: 130 }); // 上
	fire(el, 'pointermove', { clientX: 200, clientY: 150 }); // 左下
	const [right, up, downLeft] = log.filter(l => l.name === 'move').map(l => l.locate);
	assert.deepEqual([right.t, right.r, right.b, right.l], [false, true, false, false]);
	assert.deepEqual([up.t, up.r, up.b, up.l], [true, false, false, false]);
	assert.deepEqual([downLeft.t, downLeft.r, downLeft.b, downLeft.l], [false, false, true, true]);
	assert.equal(downLeft.ox, 0);
	assert.equal(downLeft.oy, 0);
});

test('fluctuation 未満の動きは止まっている扱いで、向きを引き継ぐ', () => {
	const { el, log } = setup({ fluctuation: 2 });
	fire(el, 'pointerdown', { clientX: 200, clientY: 150 });
	fire(el, 'pointermove', { clientX: 210, clientY: 150 });
	fire(el, 'pointermove', { clientX: 211, clientY: 150 });
	const last = log.at(-1).locate;
	assert.equal(last.isStop, true);
	assert.equal(last.isMove, false);
	assert.equal(last.r, true);
});

test('fluctuation 0 でも止まっているときに向きが立たない', () => {
	const { el, log } = setup({ fluctuation: 0 });
	fire(el, 'pointerdown', { clientX: 200, clientY: 150 });
	const s = log[0].locate;
	assert.deepEqual([s.t, s.r, s.b, s.l], [false, false, false, false]);
});

test('range の外で押した操作は無視する', () => {
	const { el, log } = setup({ range: { x: 0, y: 0, w: 50, h: 50 } });
	fire(el, 'pointerdown', { clientX: 200, clientY: 150 }); // (100, 100)
	assert.equal(log.length, 0);
});

test('操作中に range から出たら end を呼んで終える', () => {
	const { el, log, ctrl } = setup({ range: { x: 0, y: 0, w: 50, h: 50 } });
	fire(el, 'pointerdown', { clientX: 110, clientY: 60 });
	fire(el, 'pointermove', { clientX: 200, clientY: 60 });
	assert.deepEqual(log.map(l => l.name), ['start', 'end']);
	assert.equal(ctrl.active, false);
	assert.equal(el.captured.size, 0);
});

test('2 本目の指・別の pointerId は無視する', () => {
	const { el, log } = setup();
	fire(el, 'pointerdown', { clientX: 110, clientY: 60, pointerId: 1 });
	fire(el, 'pointerdown', { clientX: 120, clientY: 60, pointerId: 2, isPrimary: false });
	fire(el, 'pointermove', { clientX: 150, clientY: 60, pointerId: 2 });
	fire(el, 'pointerup', { clientX: 150, clientY: 60, pointerId: 2 });
	assert.deepEqual(log.map(l => l.name), ['start']);
});

test('マウスの右クリックでは始まらない', () => {
	const { el, log } = setup();
	fire(el, 'pointerdown', { clientX: 110, clientY: 60, pointerType: 'mouse', button: 2 });
	assert.equal(log.length, 0);
});

test('pointercancel は cancel を呼ぶ。cancel が無ければ end を呼ぶ', () => {
	const a = setup();
	fire(a.el, 'pointerdown', { clientX: 110, clientY: 60 });
	fire(a.el, 'pointercancel', {});
	assert.deepEqual(a.log.map(l => l.name), ['start', 'cancel']);

	const el = new FakeElement();
	const names = [];
	new TouchCtrl({ target: el, callback: { end: () => names.push('end') } });
	fire(el, 'pointerdown', { clientX: 110, clientY: 60 });
	fire(el, 'lostpointercapture', {});
	assert.deepEqual(names, ['end']);
});

test('hold は押している間 interval ごとに呼ばれ、離すと止まる', () => {
	mock.timers.enable({ apis: ['setInterval'] });
	try {
		const el = new FakeElement();
		let holds = 0;
		new TouchCtrl({ target: el, interval: 100, callback: { hold: () => holds++ } });
		fire(el, 'pointerdown', { clientX: 110, clientY: 60 });
		mock.timers.tick(350);
		assert.equal(holds, 3);
		fire(el, 'pointerup', { clientX: 110, clientY: 60 });
		mock.timers.tick(500);
		assert.equal(holds, 3);
	} finally {
		mock.timers.reset();
	}
});

test('speed は interval の旧名として効く', () => {
	assert.equal(new TouchCtrl({ target: new FakeElement(), speed: 50 }).interval, 50);
	assert.equal(new TouchCtrl({ target: new FakeElement(), speed: 50, interval: 30 }).interval, 30);
	assert.equal(new TouchCtrl({ target: new FakeElement(), interval: -1 }).interval, 200);
});

test('destroy でリスナー・捕捉・touch-action をすべて戻す', () => {
	const { el, log, ctrl } = setup();
	assert.equal(el.style.touchAction, 'none');
	fire(el, 'pointerdown', { clientX: 110, clientY: 60 });
	ctrl.destroy();
	assert.equal(el.listenerCount, 0);
	assert.equal(el.captured.size, 0);
	assert.equal(el.style.touchAction, '');
	fire(el, 'pointerdown', { clientX: 110, clientY: 60 });
	assert.equal(log.length, 1);
	ctrl.destroy(); // 2 回呼んでも壊れない
});

test('touchAction: false なら style に触らない', () => {
	const el = new FakeElement();
	el.style.touchAction = 'pan-y';
	new TouchCtrl({ target: el, touchAction: false });
	assert.equal(el.style.touchAction, 'pan-y');
});

test('cancel() で外から操作を打ち切れる', () => {
	const { el, log, ctrl } = setup();
	fire(el, 'pointerdown', { clientX: 110, clientY: 60 });
	ctrl.cancel();
	assert.deepEqual(log.map(l => l.name), ['start', 'cancel']);
	assert.equal(ctrl.active, false);
});

test('コールバックが例外を投げても次の操作は始められる', () => {
	const el = new FakeElement();
	let starts = 0;
	const ctrl = new TouchCtrl({ target: el, callback: { start: () => starts++, end: () => { throw new Error('x'); } } });
	fire(el, 'pointerdown', { clientX: 110, clientY: 60 });
	// EventTarget はリスナーの例外を外へ投げないので、ハンドラを直に呼ぶ
	assert.throws(() => ctrl._onUp(new FakePointerEvent('pointerup', { clientX: 110, clientY: 60 })), /x/);
	fire(el, 'pointerdown', { clientX: 110, clientY: 60 });
	assert.equal(starts, 2);
});

test('target が無ければ TypeError', () => {
	assert.throws(() => new TouchCtrl({}), TypeError);
});

test('UMD 版も同じクラスを返す', () => {
	const require = createRequire(import.meta.url);
	const Umd = require('../dist/touch-ctrl.umd.js');
	const el = new FakeElement();
	const names = [];
	new Umd({ target: el, callback: { start: () => names.push('start') } });
	fire(el, 'pointerdown', { clientX: 110, clientY: 60 });
	assert.deepEqual(names, ['start']);
});
