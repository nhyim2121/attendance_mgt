/** 직원 캐릭터: 이목구비 없는 귀여운 선 그림을 SVG로 그려 PNG로 만든다 (브라우저 안에서만).
 *  그림체: 펜(흰 종이·검은 선·먹 머리) / 칠판(초록 칠판·분필 선).
 *  증명사진은 머리 길이를 짐작하는 데만 쓰고 그림에 넣지 않는다. 사진 없이도 만들 수 있다. */

export const HAIRS = ["짧은 머리", "가르마", "단발", "긴 머리", "까까머리"] as const;
export const STYLES = ["펜", "칠판"] as const;
export type Hair = (typeof HAIRS)[number];
export type Style = (typeof STYLES)[number];
export interface CharOpts { hair: Hair; glasses: boolean; style: Style; seed: number }

const S = 200, CX = 100, CY = 104; // 얼굴 가운데
const FW = 38, FH = 45;            // 얼굴 반지름

function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const p = (x: number, y: number) => `${x.toFixed(1)},${y.toFixed(1)}`;
const at = (deg: number, r: number, ry = r) => [CX + Math.cos((deg * Math.PI) / 180) * r, CY + Math.sin((deg * Math.PI) / 180) * ry] as const;

/** 삐죽삐죽한 머리 윗부분 (왼쪽 귀 위 → 정수리 → 오른쪽 귀 위) */
function spikyCap(rnd: () => number, spikes: number, len: number, lift = 0): string {
  const pts: string[] = [];
  const from = 168, to = 372; // 각도 (도)
  for (let k = 0; k <= spikes * 2; k++) {
    const a = from + ((to - from) * k) / (spikes * 2);
    const tip = k % 2 === 1;
    const r = tip ? FW + 6 + len * (0.6 + rnd() * 0.6) : FW + 2 + rnd() * 3;
    const ry = tip ? FH + 4 + len * (0.6 + rnd() * 0.6) : FH + 1 + rnd() * 2;
    const skew = tip ? (rnd() - 0.3) * 5 : 0;
    const [x, y] = at(a + skew, r, ry);
    pts.push(p(x, y - lift));
  }
  // 이마 쪽: 앞머리 끝을 들쭉날쭉하게
  const fringe: string[] = [];
  const n = 7;
  for (let k = n; k >= 0; k--) {
    const x = CX - FW + 4 + ((2 * FW - 8) * k) / n;
    const y = CY - FH * 0.42 + (k % 2 ? 9 + rnd() * 7 : rnd() * 3);
    fringe.push(p(x, y));
  }
  return `M${pts.join(" L")} L${fringe.join(" L")} Z`;
}

/** 매끈한 머리 (가르마·단발·긴 머리 윗부분) */
function smoothCap(rnd: () => number, part: number): string {
  const [lx, ly] = at(175, FW + 4, FH + 2), [rx, ry] = at(5, FW + 4, FH + 2);
  const top = CY - FH - 10 - rnd() * 4;
  const px = CX + part * 14;
  return `M${p(lx, ly)} C${p(lx - 2, CY - FH - 4)} ${p(CX - 30, top)} ${p(CX, top)} C${p(CX + 30, top)} ${p(rx + 2, CY - FH - 4)} ${p(rx, ry)}`
    + ` C${p(rx - 4, CY - 22)} ${p(px + 16, CY - FH * 0.55)} ${p(px, CY - FH * 0.62)}`
    + ` C${p(px - 10, CY - FH * 0.3)} ${p(lx + 14, CY - 30)} ${p(lx + 4, ly + 8)} Z`;
}

/** 옆·뒷머리 (얼굴 뒤에 그린다) */
function backHair(len: number): string {
  const y = CY + len;
  return `M${p(CX - FW - 6, CY - 10)} C${p(CX - FW - 14, CY + len * 0.4)} ${p(CX - FW - 10, y)} ${p(CX - FW + 2, y)}`
    + ` L${p(CX + FW - 2, y)} C${p(CX + FW + 10, y)} ${p(CX + FW + 14, CY + len * 0.4)} ${p(CX + FW + 6, CY - 10)}`
    + ` C${p(CX + FW, CY - FH - 14)} ${p(CX - FW, CY - FH - 14)} ${p(CX - FW - 6, CY - 10)} Z`;
}

export function characterSvg(o: CharOpts): string {
  const rnd = rand(o.seed);
  const chalk = o.style === "칠판";
  const bg = chalk ? "#2f4b3c" : ["#fbfaf7", "#ffffff", "#f6f3ea"][Math.floor(rnd() * 3)];
  const line = chalk ? "#f4f1e6" : "#1d1d1f";
  const skin = chalk ? "#3a5a49" : "#ffffff";
  const hairFill = chalk ? "url(#chalkHair)" : "#1d1d1f";
  const shirt = chalk ? "#355543" : "#ffffff";
  const sw = chalk ? 3.2 : 3;
  const filt = chalk ? ` filter="url(#chalk)"` : "";

  let back = "", cap = "";
  switch (o.hair) {
    case "짧은 머리": cap = spikyCap(rnd, 11 + Math.floor(rnd() * 3), 5 + rnd() * 4); break;
    case "까까머리": cap = spikyCap(rnd, 14, 2.5, -2); break;
    case "가르마": cap = smoothCap(rnd, rnd() < 0.5 ? -1 : 1); break;
    case "단발": back = backHair(26 + rnd() * 6); cap = smoothCap(rnd, rnd() < 0.5 ? -0.6 : 0.6); break;
    case "긴 머리": back = backHair(62 + rnd() * 10); cap = smoothCap(rnd, rnd() < 0.5 ? -0.4 : 0.4); break;
  }
  const buzz = o.hair === "까까머리";
  const ear = (x: number, flip: number) =>
    `<path d="M${p(x, CY - 8)} C${p(x - 13 * flip, CY - 14)} ${p(x - 14 * flip, CY + 12)} ${p(x - 1 * flip, CY + 14)}" fill="${skin}" stroke="${line}" stroke-width="${sw}" stroke-linecap="round"/>`
    + `<path d="M${p(x - 4 * flip, CY - 3)} q${-5 * flip},4 0,9" fill="none" stroke="${line}" stroke-width="${sw * 0.6}" stroke-linecap="round"/>`;
  const glasses = o.glasses
    ? `<g fill="none" stroke="${line}" stroke-width="${sw * 0.85}">`
      + `<rect x="${CX - 31}" y="${CY - 6}" width="26" height="19" rx="8"/><rect x="${CX + 5}" y="${CY - 6}" width="26" height="19" rx="8"/>`
      + `<path d="M${CX - 5} ${CY + 1} q5 -4 10 0 M${CX - 31} ${CY + 1} l-7 -2 M${CX + 31} ${CY + 1} l7 -2"/></g>`
    : "";
  const shine = chalk ? "" : `<path d="M${p(CX - 18, CY - FH - 6)} q8 -6 18 -5" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" opacity=".85"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S * 2}" height="${S * 2}">
<defs>
  <clipPath id="c"><circle cx="100" cy="100" r="99"/></clipPath>
  <filter id="chalk" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="${o.seed % 97}"/>
    <feDisplacementMap in="SourceGraphic" scale="2.2"/></filter>
  <pattern id="chalkHair" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(${rnd() < 0.5 ? 35 : -35})">
    <rect width="5" height="5" fill="#2f4b3c"/><rect width="2.4" height="5" fill="#f4f1e6" opacity=".9"/></pattern>
</defs>
<g clip-path="url(#c)">
  <rect width="${S}" height="${S}" fill="${bg}"/>
  ${chalk ? `<g opacity=".03" fill="#fff">${Array.from({ length: 30 }, () => `<circle cx="${(rnd() * S).toFixed(0)}" cy="${(rnd() * S).toFixed(0)}" r="${(4 + rnd() * 14).toFixed(0)}"/>`).join("")}</g>` : ""}
  <g${filt} stroke-linejoin="round">
    <path d="M${p(26, 210)} C${p(32, 168)} ${p(58, 156)} ${p(84, 152)} L${p(116, 152)} C${p(142, 156)} ${p(168, 168)} ${p(174, 210)} Z" fill="${shirt}" stroke="${line}" stroke-width="${sw}"/>
    <path d="M${p(84, 152)} L${p(100, 172)} L${p(116, 152)}" fill="none" stroke="${line}" stroke-width="${sw}" stroke-linecap="round"/>
    ${back ? `<path d="${back}" fill="${hairFill}" stroke="${line}" stroke-width="${sw}"/>` : ""}
    <path d="M${p(CX - 11, CY + FH - 8)} L${p(CX - 12, 154)} M${p(CX + 11, CY + FH - 8)} L${p(CX + 12, 154)}" stroke="${line}" stroke-width="${sw}" stroke-linecap="round"/>
    <rect x="${CX - 11}" y="${CY + FH - 10}" width="22" height="${154 - (CY + FH - 10)}" fill="${skin}"/>
    ${ear(CX - FW + 2, 1)}${ear(CX + FW - 2, -1)}
    <ellipse cx="${CX}" cy="${CY}" rx="${FW}" ry="${FH}" fill="${skin}" stroke="${line}" stroke-width="${sw}"/>
    <path d="${cap}" fill="${buzz && !chalk ? "#4a4a4f" : hairFill}" stroke="${line}" stroke-width="${sw}"/>
    ${shine}
    ${glasses}
  </g>
</g>
<circle cx="100" cy="100" r="98" fill="none" stroke="${chalk ? "#1f3329" : "#1d1d1f"}" stroke-width="3"/>
</svg>`;
}

/** SVG → PNG */
export async function renderCharacter(o: CharOpts): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([characterSvg(o)], { type: "image/svg+xml" }));
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error("캐릭터를 그리지 못했습니다."));
      i.src = url;
    });
    const cv = document.createElement("canvas");
    cv.width = cv.height = 256;
    const ctx = cv.getContext("2d")!;
    ctx.drawImage(img, 0, 0, 256, 256);
    return await new Promise((ok, fail) => cv.toBlob((b) => (b ? ok(b) : fail(new Error("캐릭터를 만들지 못했습니다."))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 증명사진으로 머리 길이만 짐작 (배경과 다른 어두운 부분이 어깨 쪽 옆까지 내려오면 긴 머리) */
export async function guessHair(file: File): Promise<Hair> {
  const img = await new Promise<HTMLImageElement>((ok, fail) => {
    const i = new Image();
    i.onload = () => ok(i);
    i.onerror = () => fail(new Error("사진을 읽지 못했습니다. JPG·PNG 사진을 골라 주세요."));
    i.src = URL.createObjectURL(file);
  });
  const W = 96;
  const cv = document.createElement("canvas");
  cv.width = cv.height = W;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  const side = Math.min(img.width, img.height);
  ctx.drawImage(img, (img.width - side) / 2, img.height > img.width ? (img.height - side) * 0.18 : 0, side, side, 0, 0, W, W);
  URL.revokeObjectURL(img.src);
  const d = ctx.getImageData(0, 0, W, W).data;
  const lum = (x: number, y: number) => { const o = (y * W + x) * 4; return 0.299 * d[o] + 0.587 * d[o + 1] + 0.114 * d[o + 2]; };
  const all: number[] = [];
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) all.push(lum(x, y));
  const dark = [...all].sort((a, b) => a - b)[Math.floor(all.length * 0.2)] + 8;
  const ratio = (x0: number, x1: number, y0: number, y1: number) => {
    let n = 0, t = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { t++; if (lum(x, y) <= dark) n++; }
    return n / t;
  };
  // 얼굴 옆, 턱 높이쯤 (가운데에서 조금 떨어진 양옆)
  const sideLow = (ratio(Math.floor(W * 0.18), Math.floor(W * 0.3), Math.floor(W * 0.55), Math.floor(W * 0.75))
    + ratio(Math.floor(W * 0.7), Math.floor(W * 0.82), Math.floor(W * 0.55), Math.floor(W * 0.75))) / 2;
  const sideMid = (ratio(Math.floor(W * 0.18), Math.floor(W * 0.3), Math.floor(W * 0.38), Math.floor(W * 0.55))
    + ratio(Math.floor(W * 0.7), Math.floor(W * 0.82), Math.floor(W * 0.38), Math.floor(W * 0.55))) / 2;
  if (sideLow > 0.45) return "긴 머리";
  if (sideMid > 0.5) return "단발";
  return "짧은 머리";
}
