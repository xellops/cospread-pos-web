import { Logo } from "@/components/ui";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border bg-surface p-6 shadow-sm sm:p-8">
        <div className="mb-8 flex items-center gap-2">
          <Logo />
          <span className="rounded-md bg-brand-soft px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-brand">POS</span>
        </div>
        {children}
      </div>
    </main>
  );
}
