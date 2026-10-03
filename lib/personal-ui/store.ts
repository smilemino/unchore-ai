import { asMember, one, q } from "../db";
import { lock, unlock } from "../privacy";
import { Design, Edit, tipDue } from "./schema";
type Row = { revision: number; active: number | null; pending: number | null; used: boolean; tip_hidden: boolean; tip_count: number; tip_at: string | null };
export async function readUI(uid: string) {
  const row = await one<Row>("select * from personal_ui where user_id=$1", [uid]);
  const versions = await q<{ version: number; design: string }>("select version, design from personal_ui_versions where user_id=$1 and (version in (select active from personal_ui where user_id=$1 union select pending from personal_ui where user_id=$1) or version in (select version from personal_ui_versions where user_id=$1 order by version desc limit 20)) order by version desc", [uid]);
  const unpack = (n: number | null | undefined) => {
    const v = versions.find((x) => x.version === n);
    return v ? Design.parse(JSON.parse(unlock(v.design))) : null;
  };
  return { revision: row?.revision ?? 0, active: row?.active ?? null, pending: row?.pending ?? null,
    design: unpack(row?.active), draft: unpack(row?.pending),
    history: versions.map((v) => ({ version: v.version, title: Design.parse(JSON.parse(unlock(v.design))).title })),
    tip: tipDue(row?.tip_count ?? 0, row?.tip_at ? new Date(row.tip_at).toISOString() : null, row?.used ?? false, row?.tip_hidden ?? false) };
}
export type UIState = Awaited<ReturnType<typeof readUI>>;
export async function editUI(uid: string, raw: unknown) {
  const e = Edit.parse(raw);
  return asMember(uid, async () => {
    if (e.action === "read") return readUI(uid);
    await q("insert into personal_ui(user_id) values($1) on conflict do nothing", [uid]);
    if (e.action === "save") {
      const changed = await one(`with updated as (
        update personal_ui set revision=revision+1, pending=revision+1, updated_at=now()
        where user_id=$1 and revision=$2 returning revision
      ) insert into personal_ui_versions(user_id,version,design) select $1,revision,$3 from updated returning version`,
      [uid, e.base, lock(JSON.stringify(e.design))]);
      if (!changed) throw new Error("The screen changed in another chat. Read it again before editing.");
    } else {
      const changed = await one(`update personal_ui set revision=revision+1, pending=$3, active=case when $3::integer is null then null else active end, updated_at=now()
        where user_id=$1 and revision=$2 and ($3::integer is null or exists(select 1 from personal_ui_versions where user_id=$1 and version=$3)) returning revision`, [uid, e.base, e.version]);
      if (!changed) throw new Error("The screen changed, or that version is not yours. Read it again.");
    }
    return readUI(uid);
  });
}
export async function checkUI(uid: string, version: number, pass: boolean) {
  return one(`update personal_ui set active=case when $3 then pending else active end, pending=null,
    used=used or $3, updated_at=now() where user_id=$1 and pending=$2 returning revision`, [uid, version, pass]);
}
export async function claimTip(uid: string) {
  await q("insert into personal_ui(user_id) values($1) on conflict do nothing", [uid]);
  return Boolean(await one(`update personal_ui set tip_count=tip_count+1, tip_at=now() where user_id=$1
    and not used and not tip_hidden and tip_count<3 and (tip_at is null or tip_at <= now()-interval '14 days') returning user_id`, [uid]));
}
