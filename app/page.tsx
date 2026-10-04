"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Spinner } from "@/components/ui";
import { useSession } from "@/lib/session";

export default function Home() {
  const router = useRouter();
  const session = useSession();

  useEffect(() => {
    if (session === undefined) return;
    router.replace(session ? "/pos" : "/login");
  }, [session, router]);

  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner />
    </div>
  );
}
