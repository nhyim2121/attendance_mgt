/** 한글(hwpx) 문서 XML을 읽고 쓰는 작은 도구 (2026-11-23).
 *  hwpx 안의 XML은 늘 올바른 형식이라, 태그·속성·글자만 나눠 트리로 만들고 그대로 다시 쓴다.
 *  글자는 원문 그대로(이스케이프된 채) 두고, 읽을 때만 풀어서 쓴다. */

export interface XEl { tag: string; attrs: [string, string][]; kids: XNode[]; self: boolean }
export type XNode = XEl | string;

export const isEl = (n: XNode): n is XEl => typeof n !== "string";

/** 문서 전체: 머리말(<?xml ... ?>)과 뿌리 요소 */
export function parse(xml: string): { head: string; root: XEl } {
  let i = 0;
  let head = "";
  const stack: XEl[] = [{ tag: "#doc", attrs: [], kids: [], self: false }];
  const n = xml.length;
  while (i < n) {
    const lt = xml.indexOf("<", i);
    if (lt < 0) { stack[stack.length - 1].kids.push(xml.slice(i)); break; }
    if (lt > i) stack[stack.length - 1].kids.push(xml.slice(i, lt));
    if (xml.startsWith("<?", lt)) { const e = xml.indexOf("?>", lt); head += xml.slice(lt, e + 2); i = e + 2; continue; }
    if (xml.startsWith("<!--", lt)) { const e = xml.indexOf("-->", lt); i = e + 3; continue; }
    if (xml.startsWith("<![CDATA[", lt)) {
      const e = xml.indexOf("]]>", lt);
      stack[stack.length - 1].kids.push(esc(xml.slice(lt + 9, e)));
      i = e + 3; continue;
    }
    // 태그 끝 찾기 (따옴표 안의 > 는 건너뜀)
    let j = lt + 1, q = "";
    for (; j < n; j++) {
      const c = xml[j];
      if (q) { if (c === q) q = ""; } else if (c === '"' || c === "'") q = c; else if (c === ">") break;
    }
    const body = xml.slice(lt + 1, j);
    i = j + 1;
    if (body[0] === "/") { stack.pop(); continue; }
    const self = body.endsWith("/");
    const inner = self ? body.slice(0, -1) : body;
    const sp = inner.search(/\s/);
    const tag = sp < 0 ? inner : inner.slice(0, sp);
    const attrs: [string, string][] = [];
    if (sp >= 0) {
      const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
      let m: RegExpExecArray | null;
      const s = inner.slice(sp);
      while ((m = re.exec(s))) attrs.push([m[1], m[3] ?? m[4] ?? ""]);
    }
    const el: XEl = { tag, attrs, kids: [], self };
    stack[stack.length - 1].kids.push(el);
    if (!self) stack.push(el);
  }
  const root = stack[0].kids.find(isEl);
  if (!root) throw new Error("XML 뿌리 요소가 없습니다");
  return { head, root };
}

export function write(n: XNode): string {
  if (!isEl(n)) return n;
  const a = n.attrs.map(([k, v]) => ` ${k}="${v}"`).join("");
  if (n.self && !n.kids.length) return `<${n.tag}${a}/>`;
  return `<${n.tag}${a}>${n.kids.map(write).join("")}</${n.tag}>`;
}

export const attr = (e: XEl, k: string) => e.attrs.find((x) => x[0] === k)?.[1];
export function setAttr(e: XEl, k: string, v: string) {
  const a = e.attrs.find((x) => x[0] === k);
  if (a) a[1] = v; else e.attrs.push([k, v]);
}
export const kids = (e: XEl, tag?: string) => e.kids.filter((k): k is XEl => isEl(k) && (!tag || k.tag === tag));
export const kid = (e: XEl, tag: string) => e.kids.find((k): k is XEl => isEl(k) && k.tag === tag);
/** 아래로 모두 (깊이 우선) */
export function* walk(e: XEl): Generator<XEl> {
  yield e;
  for (const k of e.kids) if (isEl(k)) yield* walk(k);
}
export const clone = <T extends XNode>(n: T): T =>
  (isEl(n) ? { tag: n.tag, attrs: n.attrs.map((a) => [a[0], a[1]] as [string, string]), kids: n.kids.map(clone), self: n.self } : n) as T;

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&amp;/g, "&");
