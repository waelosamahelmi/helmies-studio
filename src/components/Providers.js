"use client";

import { SessionProvider } from "next-auth/react";
import { ToastProvider } from "@/components/ToastProvider";
import { AuthModalProvider } from "@/components/AuthModal";
import { Toaster } from "react-hot-toast";
import DevMode from "@/components/DevMode";

export default function Providers({ children }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <AuthModalProvider>{children}</AuthModalProvider>
      </ToastProvider>
      <DevMode />
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "var(--ink-200)",
            color: "var(--tx)",
            border: "1px solid var(--line-strong)",
            borderRadius: "var(--r-md)",
            fontSize: "var(--t-sm)",
            fontFamily: "var(--ff-ui)",
            boxShadow: "var(--lift-2)",
            padding: "var(--s-3) var(--s-4)",
          },
          success: { iconTheme: { primary: "var(--signal)", secondary: "var(--ink-200)" } },
          error: { iconTheme: { primary: "var(--fault)", secondary: "var(--ink-200)" } },
        }}
      />
    </SessionProvider>
  );
}
