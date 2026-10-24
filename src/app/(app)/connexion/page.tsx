import { LoginForm } from "@client/components/shell/LoginForm";
import { safeNextPath } from "@shared/redirect";

export const metadata = { title: "Connexion" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-[460px] py-6">
      <LoginForm next={safeNextPath(next)} />
    </div>
  );
}
