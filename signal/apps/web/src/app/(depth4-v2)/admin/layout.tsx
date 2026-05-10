import type { ReactNode } from "react";
import { LogoutButton } from "@/components/auth/LogoutButton";

export default function AdminToolsLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <div className="flex justify-end border-b border-white/[0.06] px-4 py-2">
        <LogoutButton
          buttonClassName="min-h-9 px-3 py-1.5 text-xs text-[#888888] hover:text-[#ffffff] focus-visible:outline-[#E8473F] sm:min-h-0"
        />
      </div>
      {children}
    </div>
  );
}
