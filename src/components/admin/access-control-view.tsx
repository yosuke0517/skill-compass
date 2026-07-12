import Link from "next/link";
import { Check, CircleAlert, UserRound } from "lucide-react";

import {
  updatePlanEntitlementAction,
  updateUserEntitlementAction,
  updateUserRoleAndPlanAction,
} from "@/app/actions/admin-access";
import type { AccessControlData } from "@/lib/admin/access-control";

export function AccessControlView({
  data,
  feedback,
}: {
  data: AccessControlData;
  feedback: { error?: string; saved?: string };
}) {
  const selected = data.selectedUser;

  return (
    <>
      <div className="admin-page-heading" id="access">
        <div>
          <p className="eyebrow">Access control</p>
          <h1>アクセス管理</h1>
          <p>ユーザーのrole、plan、entitlementを管理します。</p>
        </div>
        <span className="admin-status-pill"><Check size={15} aria-hidden="true" />権限をDBから解決</span>
      </div>

      {feedback.saved ? <p className="admin-feedback success">変更を保存しました。</p> : null}
      {feedback.error ? <p className="admin-feedback error"><CircleAlert size={16} aria-hidden="true" />{errorMessage(feedback.error)}</p> : null}

      <section className="admin-access-grid" aria-label="Access workspace">
        <div className="admin-panel admin-user-list" id="users">
          <div className="admin-panel-heading"><div><p className="eyebrow">Users</p><h2>ユーザー</h2></div><strong>{data.users.length}</strong></div>
          <label className="admin-search">検索<input type="search" placeholder="emailまたは名前" /></label>
          <div className="admin-user-rows">
            {data.users.map((user) => (
              <Link key={user.id} href={`/admin/access?user=${encodeURIComponent(user.id)}`} className={selected?.id === user.id ? "selected" : undefined}>
                <span className="admin-user-icon"><UserRound size={16} aria-hidden="true" /></span>
                <span className="admin-user-copy"><strong>{user.displayName ?? "Unnamed user"}</strong><small>{user.email}</small></span>
                <span className="admin-user-meta"><b>{user.role}</b><small>{user.plan}</small></span>
              </Link>
            ))}
          </div>
        </div>

        <div className="admin-panel admin-detail">
          {selected ? <>
            <div className="admin-panel-heading"><div><p className="eyebrow">Selected user</p><h2>ユーザー権限</h2><p>{selected.email}</p></div></div>
            <form action={updateUserRoleAndPlanAction} className="admin-form-grid">
              <input type="hidden" name="userId" value={selected.id} />
              <label>Role<select name="role" defaultValue={selected.role}><option value="admin">admin</option><option value="normal">normal</option></select></label>
              <label>Plan<select name="plan" defaultValue={selected.plan}><option value="free">free</option><option value="pro">pro</option></select></label>
              <button type="submit">Role / planを保存</button>
            </form>
            <div className="admin-capability-list">
              <div className="admin-section-heading"><h3>個別entitlement</h3><span>planの既定値を上書き</span></div>
              {selected.capabilities.map((capability) => (
                <form key={capability.id} action={updateUserEntitlementAction} className="admin-capability-row">
                  <input type="hidden" name="userId" value={selected.id} />
                  <input type="hidden" name="entitlementId" value={capability.id} />
                  <div><strong>{capability.id}</strong><small>{capability.description}</small></div>
                  <span className={`capability-source source-${capability.source}`}>{sourceLabel(capability.source)}</span>
                  <select name="mode" defaultValue={modeFor(capability.source)} disabled={capability.source === "admin"} aria-label={`${capability.id} mode`}>
                    <option value="inherit">inherit</option><option value="allow">allow</option><option value="deny">deny</option>
                  </select>
                  <button type="submit" className="icon-button" title="entitlementを保存" aria-label={`${capability.id}を保存`}><Check size={16} aria-hidden="true" /></button>
                </form>
              ))}
            </div>
          </> : <p>ユーザーを選択してください。</p>}
        </div>
      </section>

      <section className="admin-panel admin-wide-panel" id="plans">
        <div className="admin-panel-heading"><div><p className="eyebrow">Plans</p><h2>Plan default</h2></div><span>プランの標準entitlement</span></div>
        <div className="admin-plan-grid">
          {data.plans.map((plan) => <div key={plan.id} className="admin-plan-column"><h3>{plan.id}</h3>{plan.capabilities.map((capability) => (
            <form key={capability.id} action={updatePlanEntitlementAction} className="admin-plan-row">
              <input type="hidden" name="planId" value={plan.id} /><input type="hidden" name="entitlementId" value={capability.id} />
              <label><input type="checkbox" name="enabled" defaultChecked={capability.enabled} /><span>{capability.id}</span></label>
              <button type="submit" className="text-button">保存</button>
            </form>
          ))}</div>)}
        </div>
      </section>

      <section className="admin-panel admin-wide-panel" id="integrations">
        <div className="admin-panel-heading"><div><p className="eyebrow">Integrations</p><h2>外部連携</h2></div></div>
        <p className="admin-muted">Google Calendar、X、音声Providerの接続状態は、Podcast Studio実装時にこの領域へ追加します。</p>
      </section>

      <section className="admin-panel admin-wide-panel" id="audit">
        <div className="admin-panel-heading"><div><p className="eyebrow">Audit</p><h2>監査ログ</h2></div><span>直近50件</span></div>
        {data.recentAudit.length === 0 ? <p className="admin-muted">まだ変更履歴はありません。</p> : <div className="admin-audit-list">{data.recentAudit.map((item) => <div key={item.id}><strong>{item.action}</strong><span>{item.targetType} / {item.targetId}</span><time dateTime={item.createdAt.toISOString()}>{item.createdAt.toLocaleString("ja-JP")}</time></div>)}</div>}
      </section>
    </>
  );
}

function sourceLabel(source: string): string {
  return { admin: "admin固定", plan: "plan", override_allow: "個別allow", override_deny: "個別deny", none: "未付与" }[source] ?? source;
}

function modeFor(source: string): string {
  if (source === "override_allow") return "allow";
  if (source === "override_deny") return "deny";
  return "inherit";
}

function errorMessage(error?: string): string {
  return {
    "invalid-input": "入力値を確認してください。",
    "admin-fixed-entitlement": "admin固定の権限はdenyできません。",
    "last-admin": "最後のadminはnormalへ変更できません。",
  }[error ?? ""] ?? "変更を保存できませんでした。";
}
