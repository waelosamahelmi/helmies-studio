"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function BillingPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/settings?tab=billing");
  }, [router]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100dvh",
        background: "var(--v6-bg, #09070c)",
        color: "var(--v6-text, #fff8fc)",
        fontFamily: "var(--v6-sans, system-ui, sans-serif)",
        fontSize: 13,
      }}
    >
      Redirecting to billing settings…
    </div>
  );
}
