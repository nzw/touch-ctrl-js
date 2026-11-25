/**
 * touch-ctrl
 * スマートフォン・マウス・ペンの「押す → 動かす → 離す」を 1 つの API で受け取るライブラリ。
 * Pointer Events で実装しているので、タッチとマウスの分岐を持たない。
 *
 * @license MIT
 */

const DEFAULTS = {
	interval: 200,
	fluctuation: 0.5,
	touchAction: 'none'
};

const round2 = value => Math.round(value * 100) / 100;

const isObject = value => value !== null && typeof value === 'object';

class TouchCtrl {
	/**
	 * @param {object} [options]
	 * @param {Element} [options.target]   操作を受け取る要素（省略時は document.body）
	 * @param {{x?:number,y?:number,w?:number,h?:number}} [options.range]
	 *        target の左上を原点とした操作範囲。範囲の外で押した操作は無視し、
	 *        操作中に範囲から出たら、その時点で end を呼んで終える
	 * @param {number} [options.interval]  押している間 hold を呼ぶ間隔（ms）
	 * @param {number} [options.speed]     interval の旧名（v1 互換）
	 * @param {number} [options.fluctuation] この距離（px）未満の移動は「止まっている」とみなす
	 * @param {string|false} [options.touchAction] target に付ける CSS touch-action。false で触らない
	 * @param {object} [options.callback]  start / move / hold / end / cancel
	 */
	constructor(options = {}) {
		const opts = isObject(options) ? options : {};
		const target = opts.target || (typeof document !== 'undefined' ? document.body : null);
		if (!target || typeof target.addEventListener !== 'function') {
			throw new TypeError('TouchCtrl: target must be an Element');
		}

		this.target = target;
		this.range = isObject(opts.range) ? { ...opts.range } : {};
		this.interval = positiveNumber(opts.interval, positiveNumber(opts.speed, DEFAULTS.interval));
		this.fluctuation = nonNegativeNumber(opts.fluctuation, DEFAULTS.fluctuation);
		this.callback = isObject(opts.callback) ? opts.callback : {};
		this.locate = null;
		this.destroyed = false;

		this._pointerId = null;
		this._rect = null;
		this._bounds = null;
		this._startLocate = null;
		this._lastEvent = null;
		this._holdTimer = null;

		// 付け外しで同じ関数を渡せるよう、束縛した関数はここで 1 度だけ作る
		this._onDown = this._onDown.bind(this);
		this._onMove = this._onMove.bind(this);
		this._onUp = this._onUp.bind(this);
		this._onCancel = this._onCancel.bind(this);

		this._touchAction = opts.touchAction === undefined ? DEFAULTS.touchAction : opts.touchAction;
		if (this._touchAction !== false && target.style) {
			this._prevTouchAction = target.style.touchAction;
			target.style.touchAction = this._touchAction;
		}

		target.addEventListener('pointerdown', this._onDown);
	}

	/** 操作中かどうか */
	get active() {
		return this._pointerId !== null;
	}

	/** 操作中なら cancel を呼んで終える */
	cancel() {
		if (this.active) this._finish('cancel', this._lastEvent);
	}

	/** リスナーとタイマーをすべて外す。以後このインスタンスは何もしない */
	destroy() {
		if (this.destroyed) return;
		if (this.active) this._release();
		this.target.removeEventListener('pointerdown', this._onDown);
		if (this._touchAction !== false && this.target.style) {
			this.target.style.touchAction = this._prevTouchAction;
		}
		this.destroyed = true;
	}

	_onDown(e) {
		if (this.active || this.destroyed) return;
		if (e.isPrimary === false) return;
		if (e.pointerType === 'mouse' && e.button !== 0) return;

		this._rect = this.target.getBoundingClientRect();
		this._bounds = resolveBounds(this.range, this._rect);

		const point = this._point(e);
		if (!inBounds(point, this._bounds)) return;

		this._pointerId = e.pointerId;
		this._lastEvent = e;
		if (typeof this.target.setPointerCapture === 'function') {
			try {
				this.target.setPointerCapture(e.pointerId);
			} catch (err) {
				// 捕捉できなくても target 上の操作は受け取れる
			}
		}
		this.target.addEventListener('pointermove', this._onMove);
		this.target.addEventListener('pointerup', this._onUp);
		this.target.addEventListener('pointercancel', this._onCancel);
		this.target.addEventListener('lostpointercapture', this._onCancel);

		this.locate = this._startLocate = buildLocate(point, null, null, this.fluctuation);
		this._call('start', e);

		if (typeof this.callback.hold === 'function') {
			this._holdTimer = setInterval(() => this._call('hold', this._lastEvent), this.interval);
		}
	}

	_onMove(e) {
		if (e.pointerId !== this._pointerId) return;
		this._lastEvent = e;
		const point = this._point(e);
		this.locate = buildLocate(point, this.locate, this._startLocate, this.fluctuation);
		if (!inBounds(point, this._bounds)) {
			this._finish('end', e);
			return;
		}
		this._call('move', e);
	}

	_onUp(e) {
		if (e.pointerId !== this._pointerId) return;
		this._lastEvent = e;
		this._finish('end', e);
	}

	_onCancel(e) {
		if (e.pointerId !== this._pointerId) return;
		this._finish('cancel', e);
	}

	_finish(type, e) {
		const handler = typeof this.callback[type] === 'function' ? type : 'end';
		this._release();
		this._call(handler, e);
		this.locate = null;
	}

	_release() {
		clearInterval(this._holdTimer);
		this._holdTimer = null;
		const id = this._pointerId;
		this._pointerId = null;
		this.target.removeEventListener('pointermove', this._onMove);
		this.target.removeEventListener('pointerup', this._onUp);
		this.target.removeEventListener('pointercancel', this._onCancel);
		this.target.removeEventListener('lostpointercapture', this._onCancel);
		if (typeof this.target.releasePointerCapture === 'function') {
			try {
				this.target.releasePointerCapture(id);
			} catch (err) {
				// すでに外れている
			}
		}
	}

	_point(e) {
		return {
			x: round2(e.clientX - this._rect.left),
			y: round2(e.clientY - this._rect.top),
			clientX: e.clientX,
			clientY: e.clientY,
			pointerType: e.pointerType || 'mouse'
		};
	}

	_call(name, e) {
		const fn = this.callback[name];
		if (typeof fn === 'function') fn.call(this, e, this.locate);
	}
}

function positiveNumber(value, fallback) {
	return typeof value === 'number' && value > 0 && isFinite(value) ? value : fallback;
}

function nonNegativeNumber(value, fallback) {
	return typeof value === 'number' && value >= 0 && isFinite(value) ? value : fallback;
}

function resolveBounds(range, rect) {
	const x = typeof range.x === 'number' ? range.x : 0;
	const y = typeof range.y === 'number' ? range.y : 0;
	const w = typeof range.w === 'number' ? range.w : rect.width;
	const h = typeof range.h === 'number' ? range.h : rect.height;
	return { x, y, maxX: x + w, maxY: y + h };
}

function inBounds(point, b) {
	return point.x >= b.x && point.x <= b.maxX && point.y >= b.y && point.y <= b.maxY;
}

/**
 * 座標と、直前の位置からの移動量・向きをまとめる。
 * 止まっている（移動が fluctuation 未満の）ときは、直前の向きを引き継ぐ。
 */
function buildLocate(point, prev, start, fluctuation) {
	const dx = prev ? round2(point.x - prev.x) : 0;
	const dy = prev ? round2(point.y - prev.y) : 0;
	const isStop = Math.abs(dx) < fluctuation && Math.abs(dy) < fluctuation;
	const keep = isStop && prev;
	return {
		x: point.x,
		y: point.y,
		clientX: point.clientX,
		clientY: point.clientY,
		pointerType: point.pointerType,
		t: keep ? prev.t : dy < 0 && -dy >= fluctuation,
		r: keep ? prev.r : dx > 0 && dx >= fluctuation,
		b: keep ? prev.b : dy > 0 && dy >= fluctuation,
		l: keep ? prev.l : dx < 0 && -dx >= fluctuation,
		dx,
		dy,
		ox: start ? round2(point.x - start.x) : 0,
		oy: start ? round2(point.y - start.y) : 0,
		isStop,
		isMove: !isStop
	};
}

export default TouchCtrl;
