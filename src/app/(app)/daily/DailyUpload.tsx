"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { uploadCaps } from "../upload/actions";
import { ResultMsg } from "../upload/forms";

/** 그날 캡스 파일을 올리면 저장하고, 올린 기록의 마지막 날로 이동한다. */
export default function DailyUpload({ open }: { open: boolean }) {
  const router = useRouter();
  const [r, action, pending] = useActionState(uploadCaps, null);
  useEffect(() => {
    if (r?.lastDay) router.push(`/daily?day=${r.lastDay}`);
  }, [r, router]);
  return (
    <details className="fold" open={open} style={{ marginBottom: 16 }}>
      <summary>오늘 캡스 출퇴근 내역 올리기</summary>
      <p className="caption">캡스에서 내려받은 그날(또는 며칠치) 출입기록 파일을 올리면 바로 집계됩니다. 이미 올린 기록은 중복으로 쌓이지 않으니 하루에 여러 번 올려도 됩니다.</p>
      <form action={action} className="row">
        <input type="file" name="files" accept=".xls,.xlsx,.csv" multiple required />
        <button className="btn primary" disabled={pending}>{pending ? "저장하는 중..." : "저장하고 집계"}</button>
      </form>
      <div style={{ marginTop: 10 }}><ResultMsg r={r} /></div>
    </details>
  );
}
