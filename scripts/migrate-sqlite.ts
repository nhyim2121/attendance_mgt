/** 이전 사이트(Streamlit)의 SQLite 저장소를 Supabase(Postgres)로 옮긴다. 처음 한 번만 실행한다.
 *
 * 실행: npm run migrate-sqlite [-- data/db/caps.sqlite] [-- --force]
 * - 대상 DB에 이미 데이터가 있으면 멈춘다 (--force면 비우고 다시 옮김).
 * - 계정은 비밀번호 해시째 legacy_users로 옮기고, 각자 처음 로그인할 때 새 계정으로 바뀐다.
 * - 이전 사이트의 일시(한국 시각 문자열)는 한국 시각으로 저장한다.
 */
import { DatabaseSync } from "node:sqlite";
import postgres from "postgres";

process.loadEnvFile(".env.local");
const args = process.argv.slice(2);
const force = args.includes("--force");
const file = args.find((a) => !a.startsWith("--")) ?? "data/db/caps.sqlite";
const src = new DatabaseSync(file, { readOnly: true });
const sql = postgres(process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
  { onnotice: () => {} });

type Row = Record<string, string | number | null>;
const all = (q: string) => src.prepare(q).all() as Row[];
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const kst = (v: unknown) => (v ? `${String(v)}+09` : null); // 'YYYY-MM-DD HH:MM:SS' 한국 시각
const day = (v: unknown) => (v ? String(v).slice(0, 10) : null);

const TABLES = ["records", "uploads", "roster", "leaves", "overrides", "settings", "reports", "report_rows", "mail_log",
  "employees", "legacy_users"];

const [{ n }] = await sql`select (select count(*) from records) + (select count(*) from leaves)
  + (select count(*) from employees) + (select count(*) from profiles) as n`;
if (Number(n) > 0 && !force) {
  console.error("대상 DB에 이미 데이터가 있습니다. 비우고 다시 옮기려면 --force 를 붙여 실행하세요.");
  process.exit(1);
}

await sql.begin(async (t) => {
  // 값을 JSON으로 넘겨 Postgres가 그대로 해석하게 한다 (드라이버가 날짜 문자열을 현지 시각으로 바꾸지 않도록)
  const insert = async (table: string, rows: Row[], chunk = 2000) => {
    if (!rows.length) return console.log(`${table}: 0건`);
    const cols = Object.keys(rows[0]).map((c) => `"${c}"`).join(", ");
    for (let i = 0; i < rows.length; i += chunk) {
      await t.unsafe(`insert into public.${table} (${cols}) overriding system value
        select ${cols} from json_populate_recordset(null::public.${table}, $1::json)`, [t.json(rows.slice(i, i + chunk) as postgres.JSONValue)]);
    }
    console.log(`${table}: ${rows.length.toLocaleString()}건`);
  };
  await t.unsafe(`truncate ${TABLES.map((x) => `public.${x}`).join(", ")} restart identity`);

  await insert("uploads", all("select * from uploads order by id").map((r) => ({
    id: r.id, kind: s(r["종류"]), file: s(r["파일"]), sheet: s(r["시트"]), count: Number(r["건수"] ?? 0),
    added: r["새기록"] === null ? null : Number(r["새기록"]), period: s(r["기간"]), user_id: s(r["사용자"]),
    created_at: kst(r["일시"]) ?? new Date().toISOString(),
  })));
  await t`select setval(pg_get_serial_sequence('public.uploads', 'id'), coalesce((select max(id) from uploads), 0) + 1, false)`;

  await insert("records", all("select * from records order by 출입일시").map((r) => ({
    ts: s(r["출입일시"]), name: s(r["이름"]), emp_id: s(r["사번"]), dept: s(r["부서"]), door: s(r["출입문"]),
    mode: s(r["모드"]), auth: s(r["인증"]), work_type: s(r["근무형태"]), place: s(r["근무지"]), note: s(r["비고"]),
    upload_id: r["업로드ID"],
  })));
  await insert("roster", all("select * from roster order by 순서").map((r) => ({
    ord: Number(r["순서"]), dept: s(r["부서"]), name: s(r["이름"]),
  })));
  await insert("leaves", all("select * from leaves").map((r) => ({
    day: day(r["일자"]), name: s(r["이름"]), dept: s(r["부서"]), rank: s(r["직급"]), type: s(r["유형"]),
    content: s(r["내용"]), note: s(r["비고"]), sheet: s(r["시트"]),
  })));
  await insert("overrides", all("select * from overrides").map((r) => ({
    employee: s(r["직원"]), day: day(r["일자"]), clock_in: r["출근"], in_type: r["출근근무형태"], clock_out: r["퇴근"],
    out_type: r["퇴근근무형태"], place: r["근무지"], note: r["비고"], edited_by: s(r["수정자"]),
    edited_at: kst(r["수정일시"]) ?? new Date().toISOString(),
  })));
  await insert("settings", all("select * from settings").map((r) => ({ key: s(r.key), value: JSON.parse(String(r.value)) })));
  await insert("reports", all("select * from reports").map((r) => ({
    day: day(r["일자"]), author: s(r["작성자"]), updated_at: kst(r["수정일시"]) ?? new Date().toISOString(),
    sent_at: kst(r["발송일시"]), sent_by: r["발송자"],
  })));
  await insert("report_rows", all("select * from report_rows order by id").map((r) => ({
    day: day(r["일자"]), section: s(r["섹션"]), ord: Number(r["순서"] ?? 0), dept: s(r["부서"]), rank: s(r["직급"]),
    name: s(r["성명"]), types: s(r["유형"]), title: s(r["제목"]), detail: s(r["상세"]), value: s(r["값"]), note: s(r["비고"]),
  })));
  await insert("mail_log", all("select * from mail_log order by id").map((r) => ({
    day: day(r["일자"]), subject: s(r["제목"]), to_addr: s(r["받는사람"]), cc_addr: s(r["참조"]), result: s(r["결과"]),
    user_id: s(r["사용자"]), created_at: kst(r["일시"]) ?? new Date().toISOString(),
  })));
  await insert("employees", all("select * from employees order by 순서, 이름").map((r) => ({
    name: s(r["이름"]), caps_name: s(r["캡스이름"]), emp_id: s(r["사번"]), dept: s(r["부서"]), rank: s(r["직급"]),
    join_date: day(r["입사일"]), leave_date: day(r["퇴사일"]), note: s(r["비고"]), ord: Number(r["순서"] ?? 0),
    edited_by: s(r["수정자"]), edited_at: kst(r["수정일시"]) ?? new Date().toISOString(),
  })));
  await insert("legacy_users", all("select * from users").map((r) => ({
    login_id: s(r["아이디"]), name: s(r["이름"]), role: s(r["역할"]), hash: s(r["해시"]), created_at: s(r["생성일시"]),
  })));
});

const check = await sql`select (select count(*) from records) as records, (select count(*) from leaves) as leaves,
  (select count(*) from employees) as employees, (select count(*) from legacy_users) as users`;
console.log("확인:", check[0]);
await sql.end();
