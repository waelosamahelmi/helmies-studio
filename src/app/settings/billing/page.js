"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function BillingPage() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      router.replace("/settings?tab=billing");
    }, 800);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100dvh",
        background: "var(--v6-bg, #09070c)",
        color: "var(--v6-text, #fff8fc)",
        fontFamily: "var(--v6-sans, system-ui, sans-serif)",
        gap: 16,
      }}
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4 }}
        style={{
          width: 56,
          height: 56,
          borderRadius: "50%",
          border: "2px solid var(--v6-accent)",
          borderTopColor: "transparent",
          animation: "v6-gen-orbit-spin 0.8s linear infinite",
        }}
      />
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4 }}
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--v6-muted)",
        }}
      >
        Redirecting to billing settings…
      </motion.p>
    </div>
  );
}
