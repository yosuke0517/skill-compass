import { Compass } from "lucide-react";
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
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-mark" aria-hidden="true">
          <Compass size={28} strokeWidth={1.8} />
        </div>
        <h1 id="login-title">Skill Compass</h1>
        <form action={loginAction} className="login-form">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" />
          {hasError ? <p className="form-error">Password did not match.</p> : null}
          <button type="submit">Log in</button>
        </form>
      </section>
    </main>
  );
}
