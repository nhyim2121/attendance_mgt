"use client";
/** 입력 임시 저장: 화면의 입력 양식(저장하는 form)에 적는 내용을 이 브라우저에 계속 임시 저장한다.
 *  - 저장 버튼을 눌렀는데 사이트가 잠깐 꺼져 있었거나(업데이트·재시작) 창을 실수로 닫아도, 같은 화면을 다시 열면
 *    아래쪽에 '저장 안 된 입력'이 떠서 [다시 채우기]로 되살릴 수 있다.
 *  - 저장 버튼을 누르고 사이트가 정상 응답하면 임시 저장은 지운다. 7일 지난 임시 저장도 지운다.
 *  - 비밀번호·파일·숨은 칸은 저장하지 않는다. 주소 이동용 검색 양식(GET)은 건드리지 않는다. */
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
interface Draft { at: number; values: Record<string, string> }
const PREFIX = "draft:";
const MAX_AGE = 7 * 864e5;

const store = {
  get(k: string): Draft | null { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set(k: string, d: Draft) { try { localStorage.setItem(k, JSON.stringify(d)); } catch { /* 저장 공간 없음 */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* 무시 */ } },
};

/** 저장(서버로 보내는) 양식인가: 주소가 적힌 GET 검색 양식은 뺀다 */
function isSaveForm(f: HTMLFormElement) {
  if (f.closest("[data-nodraft]") || f.dataset.nodraft !== undefined) return false;
  const action = f.getAttribute("action");
  const method = (f.getAttribute("method") || "").toLowerCase();
  if (method === "post") return true;
  return !action || action.startsWith("javascript:");
}
function fieldsOf(f: HTMLFormElement): [string, Field][] {
  const out: [string, Field][] = [];
  const seen: Record<string, number> = {};
  for (const el of Array.from(f.elements)) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) continue;
    if (el instanceof HTMLInputElement && ["password", "file", "hidden", "submit", "button", "reset", "image"].includes(el.type)) continue;
    const base = el.name || el.id;
    if (!base || base.startsWith("$ACTION")) continue;
    const n = (seen[base] = (seen[base] ?? -1) + 1);
    out.push([`${base}#${n}`, el]);
  }
  return out;
}
const valueOf = (el: Field) => (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio") ? (el.checked ? "1" : "") : el.value);
const defaultOf = (el: Field) => {
  if (el instanceof HTMLInputElement) return el.type === "checkbox" || el.type === "radio" ? (el.defaultChecked ? "1" : "") : el.defaultValue;
  if (el instanceof HTMLTextAreaElement) return el.defaultValue;
  const o = Array.from(el.options).find((x) => x.defaultSelected) ?? el.options[0];
  return o?.value ?? "";
};
/** React가 관리하는 칸에도 값이 들어가도록 원래 setter로 넣고 input 이벤트를 보낸다 */
function fill(el: Field, v: string) {
  if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
    if (el.checked !== (v === "1")) el.click();
    return;
  }
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

export default function AutoDraft() {
  const path = usePathname();
  const sp = useSearchParams().toString();
  const page = `${path}${sp ? `?${sp}` : ""}`;
  const [found, setFound] = useState<{ key: string; draft: Draft; form: HTMLFormElement }[]>([]);
  const timers = useRef(new Map<string, number>());

  const keyOf = useCallback((f: HTMLFormElement) => {
    const forms = Array.from(document.querySelectorAll<HTMLFormElement>("main.main form")).filter(isSaveForm);
    return `${PREFIX}${page}:${f.id || forms.indexOf(f)}`;
  }, [page]);

  // 오래된 임시 저장 정리
  useEffect(() => {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k?.startsWith(PREFIX) && Date.now() - (store.get(k)?.at ?? 0) > MAX_AGE) store.del(k);
      }
    } catch { /* 무시 */ }
  }, []);

  // 화면을 열면 이 화면의 임시 저장을 찾는다
  useEffect(() => {
    const t = window.setTimeout(() => {
      const hits: typeof found = [];
      for (const f of Array.from(document.querySelectorAll<HTMLFormElement>("main.main form")).filter(isSaveForm)) {
        const key = keyOf(f);
        const d = store.get(key);
        if (!d) continue;
        const differs = fieldsOf(f).some(([k, el]) => k in d.values && d.values[k] !== valueOf(el));
        if (differs) hits.push({ key, draft: d, form: f }); else store.del(key);
      }
      setFound(hits);
    }, 400);
    return () => window.clearTimeout(t);
  }, [keyOf]);

  // 적을 때마다 (0.6초 쉬면) 임시 저장, 저장 버튼을 누르면 사이트가 응답하는지 보고 지운다
  useEffect(() => {
    const main = document.querySelector("main.main");
    if (!main) return;
    const onInput = (e: Event) => {
      const f = (e.target as Element | null)?.closest?.("form");
      if (!(f instanceof HTMLFormElement) || !isSaveForm(f)) return;
      const key = keyOf(f);
      window.clearTimeout(timers.current.get(key));
      timers.current.set(key, window.setTimeout(() => {
        const fs = fieldsOf(f);
        const changed = fs.some(([, el]) => valueOf(el) !== defaultOf(el));
        if (!changed) { store.del(key); return; }
        store.set(key, { at: Date.now(), values: Object.fromEntries(fs.map(([k, el]) => [k, valueOf(el)])) });
      }, 600));
    };
    const onSubmit = (e: Event) => {
      const f = e.target;
      if (!(f instanceof HTMLFormElement) || !isSaveForm(f)) return;
      const key = keyOf(f);
      window.clearTimeout(timers.current.get(key));
      const fs = fieldsOf(f);
      store.set(key, { at: Date.now(), values: Object.fromEntries(fs.map(([k, el]) => [k, valueOf(el)])) });
      // 사이트가 살아 있으면(저장이 서버에 닿았으면) 지운다. 꺼져 있으면 남겨 두었다가 다음에 되살린다.
      window.setTimeout(async () => {
        try {
          const r = await fetch("/login", { method: "HEAD", cache: "no-store" });
          if (r.ok || r.status < 500) store.del(key);
        } catch { /* 사이트가 꺼져 있음: 임시 저장 유지 */ }
      }, 2500);
    };
    main.addEventListener("input", onInput, true);
    main.addEventListener("change", onInput, true);
    main.addEventListener("submit", onSubmit, true);
    return () => {
      main.removeEventListener("input", onInput, true);
      main.removeEventListener("change", onInput, true);
      main.removeEventListener("submit", onSubmit, true);
    };
  }, [keyOf]);

  if (!found.length) return null;
  const restore = () => {
    for (const { form, draft } of found) for (const [k, el] of fieldsOf(form)) if (k in draft.values) fill(el, draft.values[k]);
    setFound([]);
  };
  const discard = () => { for (const { key } of found) store.del(key); setFound([]); };
  const when = new Date(Math.max(...found.map((x) => x.draft.at))).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    <div className="u-draft noprint" role="status">
      <b>📝 저장 안 된 입력이 있습니다</b>
      <span>{when}에 이 화면에서 적던 내용이 브라우저에 임시 저장돼 있습니다.</span>
      <div><button className="primary" onClick={restore}>다시 채우기</button><button onClick={discard}>지우기</button></div>
    </div>
  );
}
