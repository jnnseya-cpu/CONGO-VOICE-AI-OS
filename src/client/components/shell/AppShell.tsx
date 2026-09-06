"use client";
import { useState, type ReactNode } from "react";
import type { SessionUser } from "@shared/types";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell({ user, unread, children }: { user: SessionUser | null; unread: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen">
      <Sidebar user={user} unread={unread} open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} unread={unread} onMenu={() => setOpen((o) => !o)} />
        <main className="flex-1 px-4 py-5 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
