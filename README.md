# touch-ctrl

スマートフォンのタッチ、マウス、ペンの「押す → 動かす → 離す」を 1 つの API で受け取る、依存ゼロの小さなライブラリです。
ゲームのコントローラーやスワイプ操作のように、指の位置と向きを追いかけたい場面向けです。

- Pointer Events で実装しているので、タッチとマウスの分岐がありません
- 指が要素の外へ出ても追いかけます（pointer capture）
- 操作中は画面がスクロールしません（`touch-action: none` を自動で付け、`destroy()` で戻します）
- 依存パッケージはありません

動作するブラウザ: Pointer Events に対応したもの（Chrome / Edge / Firefox / Safari 13 以降、iOS Safari 13 以降）。

## 使い方

### ES module

```html
<div id="pad" style="height: 240px"></div>
<script type="module">
	import TouchCtrl from './src/touch-ctrl.js';

	const ctrl = new TouchCtrl({
		target: document.getElementById('pad'),
		callback: {
			start(e, locate) { console.log('start', locate.x, locate.y); },
			move(e, locate)  { if (locate.r) console.log('右へ', locate.dx); },
			end(e, locate)   { console.log('end', locate.ox, locate.oy); }
		}
	});
</script>
```

### `<script>` で読む

```html
<script src="dist/touch-ctrl.umd.js"></script>
<script>
	var ctrl = new TouchCtrl({ target: document.getElementById('pad') });
</script>
```

`require('touch-ctrl')` でも読めます。型定義は `touch-ctrl.d.ts` にあります。

デモは `examples/index.html` です（`npx serve .` などでフォルダを配信して開きます）。

## オプション

| 名前 | 既定値 | 内容 |
| --- | --- | --- |
| `target` | `document.body` | 操作を受け取る要素 |
| `range` | target 全体 | `{ x, y, w, h }`。target の左上を原点とした操作範囲。範囲の外で押した操作は無視し、操作中に範囲から出たらその時点で `end` を呼んで終えます |
| `interval` | `200` | 押している間 `hold` を呼ぶ間隔（ms）。v1 の `speed` も同じ意味で使えます |
| `fluctuation` | `0.5` | この距離（px）未満の移動は「止まっている」とみなします。指の細かな震えを無視するための値です |
| `touchAction` | `'none'` | target に付ける CSS `touch-action`。`false` を渡すと style に触りません |
| `callback` | なし | 下の 5 つ |

### コールバック

どれも `(event, locate)` を受け取り、`this` はインスタンスです（`this.locate` でも同じ値が読めます）。

| 名前 | 呼ばれるとき |
| --- | --- |
| `start` | 押したとき |
| `move` | 押したまま動かしたとき |
| `hold` | 押している間、`interval` ごと |
| `end` | 離したとき、または `range` から出たとき |
| `cancel` | ブラウザが操作を取り消したとき（スクロールに変わった、通知が割り込んだなど）と `cancel()` を呼んだとき。`cancel` が無ければ `end` を呼びます |

### locate

```js
{
	x, y,             // target の左上を原点とした座標（px、小数 2 桁）
	clientX, clientY, // ビューポート基準の座標
	pointerType,      // 'touch' | 'mouse' | 'pen'
	t, r, b, l,       // 直前の位置から 上 / 右 / 下 / 左 へ動いたか。止まっているときは直前の向きを引き継ぐ
	dx, dy,           // 直前の位置からの移動量
	ox, oy,           // 押した位置からの移動量
	isStop, isMove    // 移動が fluctuation 未満なら isStop が true
}
```

## メソッド・プロパティ

| 名前 | 内容 |
| --- | --- |
| `ctrl.active` | 操作中なら `true` |
| `ctrl.locate` | いまの `locate`。操作していないときは `null` |
| `ctrl.cancel()` | 操作中なら打ち切って `cancel` を呼びます |
| `ctrl.destroy()` | リスナー・タイマー・`touch-action` をすべて戻します |

## v1 からの移行

v2 で中身を書き直しました。v1 には次の不具合がありました。

- 押すたびに move / end のリスナーが足されて外れず、10 回押すと 1 回の動きで move が 10 回呼ばれていました
- `t` / `r` / `b` / `l` の向きが逆で、止まっているときに上と右が `true` になっていました
- `start` コールバックの戻り値を `setInterval` に渡していて、`speed` が効いていませんでした
- `range` を画面の左上から測っていて、要素がページの途中にあると範囲がずれていました
- マウスで要素の外に出てから離すと、操作が終わりませんでした

書き換えが要る点は次のとおりです。

- `x` / `y` は target の左上が原点になりました。v1 と同じ値は `clientX` / `clientY` です
- `range` も target の左上が原点です
- 押し続けている間の定期呼び出しは `hold` に分けました（`speed` は `interval` の旧名として残しています）
- 範囲の外へ出たら、その時点で `end` を呼びます
- ES5 版と `lib/bind.js` はなくしました

## 開発

```sh
npm test        # dist の食い違いを確かめてから、node --test を回す
npm run build   # src/touch-ctrl.js から dist/touch-ctrl.umd.js を作る
```

ソースは `src/touch-ctrl.js` だけです。`dist/` は `npm run build` で作り、コミットします。

## License

MIT
