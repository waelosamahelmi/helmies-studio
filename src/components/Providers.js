"use client";

import { SessionProvider } from "next-auth/react";
import { ToastProvider } from "@/components/ToastProvider";
import { AuthModalProvider } from "@/components/AuthModal";

export default function Providers({ children }) {
  return (
    <SessionProvider>
      <ToastProvider>
        <AuthModalProvider>{children}</AuthModalProvider>
      </ToastProvider>
    </SessionProvider>
  );
}
