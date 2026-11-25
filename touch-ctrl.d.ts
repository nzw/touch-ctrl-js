export interface TouchCtrlLocate {
	/** target の左上を原点とした X 座標（px） */
	x: number;
	/** target の左上を原点とした Y 座標（px） */
	y: number;
	clientX: number;
	clientY: number;
	pointerType: string;
	/** 直前の位置から上へ動いたか */
	t: boolean;
	/** 直前の位置から右へ動いたか */
	r: boolean;
	/** 直前の位置から下へ動いたか */
	b: boolean;
	/** 直前の位置から左へ動いたか */
	l: boolean;
	/** 直前の位置からの移動量 */
	dx: number;
	dy: number;
	/** 押した位置からの移動量 */
	ox: number;
	oy: number;
	isStop: boolean;
	isMove: boolean;
}

export type TouchCtrlHandler = (this: TouchCtrl, event: PointerEvent, locate: TouchCtrlLocate) => void;

export interface TouchCtrlOptions {
	target?: Element;
	range?: { x?: number; y?: number; w?: number; h?: number };
	interval?: number;
	/** @deprecated interval を使う */
	speed?: number;
	fluctuation?: number;
	touchAction?: string | false;
	callback?: {
		start?: TouchCtrlHandler;
		move?: TouchCtrlHandler;
		hold?: TouchCtrlHandler;
		end?: TouchCtrlHandler;
		cancel?: TouchCtrlHandler;
	};
}

declare class TouchCtrl {
	constructor(options?: TouchCtrlOptions);
	readonly target: Element;
	readonly active: boolean;
	readonly destroyed: boolean;
	locate: TouchCtrlLocate | null;
	range: { x?: number; y?: number; w?: number; h?: number };
	interval: number;
	fluctuation: number;
	cancel(): void;
	destroy(): void;
}

export default TouchCtrl;
