import { ArrowRight, Compass } from "lucide-react";
import { loginAction } from "@/app/actions/auth";

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const hasError = params?.error === "invalid";

  return (
    <main className="mobile-shell login-page">
      <section className="login-panel app-surface" aria-labelledby="login-title">
        <div className="brand-row">
          <div className="login-mark" aria-hidden="true">
            <Compass size={25} strokeWidth={1.9} />
          </div>
          <div>
            <p className="eyebrow">Daily calibration</p>
            <h1 id="login-title">Skill Compass</h1>
          </div>
        </div>

        <div className="axis-dial" aria-hidden="true">
          <span style={{ "--axis": 0 } as React.CSSProperties} />
          <span style={{ "--axis": 1 } as React.CSSProperties} />
          <span style={{ "--axis": 2 } as React.CSSProperties} />
          <span style={{ "--axis": 3 } as React.CSSProperties} />
          <span style={{ "--axis": 4 } as React.CSSProperties} />
        </div>

        <p className="login-copy">
          Measure what you know. Find what to review. Keep your engineering growth visible.
        </p>

        <form action={loginAction} className="login-form">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" />
          {hasError ? <p className="form-error">Password did not match.</p> : null}
          <button type="submit">
            <span>Log in</span>
            <ArrowRight size={18} strokeWidth={2} />
          </button>
        </form>
      </section>
    </main>
  );
}
