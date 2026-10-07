import type { EffectiveFingerprint } from './seed'

/**
 * Script chạy đầu mỗi document (Page.addScriptToEvaluateOnNewDocument), trước mọi script của trang.
 * Chỉ ghi đè phần CDP không làm được: deviceMemory, screen, devicePixelRatio, WebGL vendor/renderer,
 * nhiễu canvas/audio ổn định, mediaDevices, WebRTC disable.
 *
 * Nguyên tắc:
 * - Không tải gì từ mạng, không dùng Math.random: nhiễu tất định theo seed + nội dung.
 * - Hàm ghi đè giả toString() như hàm native và ném "Illegal invocation" như bản gốc.
 * - Không để lại biến global.
 */
export function buildPageScript(fp: EffectiveFingerprint): string {
  const s = fp.seed
  const config = {
    cores: s.hardware.cores,
    memory: s.hardware.memoryGb,
    languages: fp.languages,
    screen: {
      width: s.screen.width,
      height: s.screen.height,
      availWidth: s.screen.width,
      availHeight: fp.catalog.availHeight,
      colorDepth: s.screen.colorDepth,
      dpr: s.screen.dpr
    },
    webgl: s.webgl,
    canvasNoise: s.canvasNoise,
    audioNoise: s.audioNoise,
    cameras: s.mediaDevices.cameras,
    mics: s.mediaDevices.mics,
    webrtc: s.webrtc,
    uaData: uaDataConfig(fp)
  }
  return `(() => {
const C = ${JSON.stringify(config)};
${PRELUDE}
${PAGE_BODY}
${UA_DATA}
})();`
}

/** Script cho worker (dedicated/shared/service): WorkerNavigator không chịu ảnh hưởng của Page domain. */
export function buildWorkerScript(fp: EffectiveFingerprint): string {
  const config = {
    cores: fp.seed.hardware.cores,
    memory: fp.seed.hardware.memoryGb,
    languages: fp.languages,
    uaData: uaDataConfig(fp)
  }
  return `(() => {
const C = ${JSON.stringify(config)};
${PRELUDE}
if (typeof WorkerNavigator !== 'undefined') {
  getter(WorkerNavigator.prototype, 'hardwareConcurrency', () => C.cores);
  getter(WorkerNavigator.prototype, 'deviceMemory', () => C.memory);
  const langs = Object.freeze(C.languages.slice());
  getter(WorkerNavigator.prototype, 'languages', () => langs);
  getter(WorkerNavigator.prototype, 'language', () => langs[0]);
}
${UA_DATA}
})();`
}

/**
 * Giá trị high-entropy Client Hints theo seed. Gọi getHighEntropyValues ngay đầu document
 * trả giá trị thật của máy (CDP override chưa tới renderer, đo trên CfT 155), nên phải phủ lại.
 */
function uaDataConfig(fp: EffectiveFingerprint) {
  const m = fp.userAgentMetadata
  return {
    brands: m.brands,
    fullVersionList: m.fullVersionList,
    uaFullVersion: m.fullVersion,
    platform: m.platform,
    platformVersion: m.platformVersion,
    architecture: m.architecture,
    bitness: m.bitness,
    model: m.model,
    mobile: m.mobile,
    wow64: m.wow64,
    formFactors: m.formFactors
  }
}

const UA_DATA = String.raw`
if (typeof NavigatorUAData !== 'undefined') {
  method(NavigatorUAData.prototype, 'getHighEntropyValues', (orig) => function () {
    return orig.apply(this, arguments).then((v) => {
      for (const k of Object.keys(C.uaData)) {
        if (k in v) v[k] = JSON.parse(JSON.stringify(C.uaData[k]));
      }
      return v;
    });
  });
}
`

// Công cụ chung: giả toString native, getter ném Illegal invocation, thay method giữ tên/độ dài.
const PRELUDE = String.raw`
const nativeToString = Function.prototype.toString;
const masks = new WeakMap();
const toString = { toString() { return masks.has(this) ? masks.get(this) : nativeToString.call(this); } }.toString;
masks.set(toString, 'function toString() { [native code] }');
Object.defineProperty(Function.prototype, 'toString', { value: toString, writable: true, configurable: true, enumerable: false });
const mask = (fn, name) => { masks.set(fn, 'function ' + name + '() { [native code] }'); return fn; };
const isProto = Object.prototype.isPrototypeOf;
function getter(proto, prop, value) {
  const d = Object.getOwnPropertyDescriptor(proto, prop);
  if (!d || !d.get) return;
  const g = Object.getOwnPropertyDescriptor({ get [prop]() {
    if (!isProto.call(proto, this)) throw new TypeError('Illegal invocation');
    return value();
  } }, prop).get;
  mask(g, 'get ' + prop);
  Object.defineProperty(proto, prop, { get: g, set: d.set, enumerable: d.enumerable, configurable: true });
}
function method(proto, prop, make) {
  const orig = proto && proto[prop];
  if (typeof orig !== 'function') return;
  const wrapped = make(orig);
  Object.defineProperty(wrapped, 'name', { value: orig.name });
  Object.defineProperty(wrapped, 'length', { value: orig.length });
  mask(wrapped, orig.name);
  const d = Object.getOwnPropertyDescriptor(proto, prop);
  Object.defineProperty(proto, prop, { value: wrapped, writable: d.writable, enumerable: d.enumerable, configurable: true });
}
`

const PAGE_BODY = String.raw`
// --- navigator ---
getter(Navigator.prototype, 'deviceMemory', () => C.memory);
getter(Navigator.prototype, 'hardwareConcurrency', () => C.cores);
const langs = Object.freeze(C.languages.slice());
getter(Navigator.prototype, 'languages', () => langs);
getter(Navigator.prototype, 'language', () => langs[0]);

// --- screen ---
getter(Screen.prototype, 'width', () => C.screen.width);
getter(Screen.prototype, 'height', () => C.screen.height);
getter(Screen.prototype, 'availWidth', () => C.screen.availWidth);
getter(Screen.prototype, 'availHeight', () => C.screen.availHeight);
getter(Screen.prototype, 'availLeft', () => 0);
getter(Screen.prototype, 'availTop', () => 0);
getter(Screen.prototype, 'colorDepth', () => C.screen.colorDepth);
getter(Screen.prototype, 'pixelDepth', () => C.screen.colorDepth);
{
  const d = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio');
  if (d && d.get) {
    const g = Object.getOwnPropertyDescriptor({ get devicePixelRatio() { return C.screen.dpr; } }, 'devicePixelRatio').get;
    mask(g, 'get devicePixelRatio');
    Object.defineProperty(window, 'devicePixelRatio', { get: g, set: d.set, enumerable: d.enumerable, configurable: true });
  }
}

// --- WebGL: chỉ đổi UNMASKED_VENDOR/RENDERER (0x9245 / 0x9246) ---
for (const P of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
  if (!P) continue;
  method(P.prototype, 'getParameter', (orig) => function (p) {
    if (p === 0x9245) return C.webgl.vendor;
    if (p === 0x9246) return C.webgl.renderer;
    return orig.apply(this, arguments);
  });
}

// --- Canvas: nhiễu tất định theo seed + nội dung, chỉ đổi bit thấp, bỏ qua pixel trong suốt ---
const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
const origPutImageData = CanvasRenderingContext2D.prototype.putImageData;
const origDrawImage = CanvasRenderingContext2D.prototype.drawImage;
const origGetContext = HTMLCanvasElement.prototype.getContext;
const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
const origToBlob = HTMLCanvasElement.prototype.toBlob;
const origCreateElement = Document.prototype.createElement;
function noisify(data) {
  let h = (C.canvasNoise * 2654435761) >>> 0;
  for (let i = 0; i < data.length; i += 61) h = Math.imul(h ^ data[i], 16777619) >>> 0;
  let s = h || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; };
  const pixels = data.length >> 2;
  const count = Math.max(1, Math.min(pixels, Math.floor(pixels / 300)));
  for (let k = 0; k < count; k++) {
    const px = next() % pixels;
    if (data[px * 4 + 3] === 0) continue;
    const i = px * 4 + (next() % 3);
    data[i] ^= 1;
  }
}
function noisyCopy(canvas) {
  const w = canvas.width, h = canvas.height;
  if (!w || !h) return null;
  const tmp = origCreateElement.call(document, 'canvas');
  tmp.width = w; tmp.height = h;
  const ctx = origGetContext.call(tmp, '2d');
  origDrawImage.call(ctx, canvas, 0, 0);
  const img = origGetImageData.call(ctx, 0, 0, w, h);
  noisify(img.data);
  origPutImageData.call(ctx, img, 0, 0);
  return tmp;
}
method(CanvasRenderingContext2D.prototype, 'getImageData', (orig) => function () {
  const img = orig.apply(this, arguments);
  noisify(img.data);
  return img;
});
method(HTMLCanvasElement.prototype, 'toDataURL', (orig) => function () {
  const copy = noisyCopy(this);
  return orig.apply(copy || this, arguments);
});
method(HTMLCanvasElement.prototype, 'toBlob', (orig) => function () {
  const copy = noisyCopy(this);
  return orig.apply(copy || this, arguments);
});

// --- Audio: nhiễu rất nhỏ, tất định, mỗi buffer chỉ một lần ---
if (window.AudioBuffer) {
  const touched = new WeakSet();
  method(AudioBuffer.prototype, 'getChannelData', (orig) => function (channel) {
    const arr = orig.apply(this, arguments);
    if (!touched.has(arr)) {
      touched.add(arr);
      let s = ((C.audioNoise * 2246822519) ^ (channel + 1)) >>> 0 || 1;
      for (let i = 0; i < arr.length; i += 97) {
        s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
        arr[i] += ((s % 2001) - 1000) * 1e-10;
      }
    }
    return arr;
  });
}

// --- mediaDevices: chỉ lọc bớt thiết bị thật theo seed (không bịa thiết bị giả) ---
if (window.MediaDevices) {
  method(MediaDevices.prototype, 'enumerateDevices', (orig) => function () {
    return orig.apply(this, arguments).then((list) => {
      let cams = 0, mics = 0;
      return list.filter((d) => {
        if (d.kind === 'videoinput') return cams++ < C.cameras;
        if (d.kind === 'audioinput') return mics++ < C.mics;
        return true;
      });
    });
  });
}

// --- WebRTC ---
if (C.webrtc === 'disable') {
  for (const k of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel', 'RTCSessionDescription', 'RTCIceCandidate']) {
    try { delete window[k]; } catch (e) {}
  }
}
`
