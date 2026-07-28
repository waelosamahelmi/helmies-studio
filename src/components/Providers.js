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
            background: "rgb(24, 24, 27)",
            color: "#F2F2F7",
            border: "1px solid rgba(255,255,255,0.08)",
            fontSize: "0.85rem",
          },
          success: {
            iconTheme: { primary: "#00E68A", secondary: "rgb(24, 24, 27)" },
          },
          error: {
            iconTheme: { primary: "#ff3d71", secondary: "rgb(24, 24, 27)" },
          },
        }}
      />
    </SessionProvider>
  );
}
