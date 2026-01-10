"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SetupRedirect({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  useEffect(() => {
    // Check if setup is needed
    fetch("/api/setup")
      .then((res) => res.json())
      .then((data) => {
        if (data.needsSetup) {
          router.push("/setup");
        }
      })
      .catch((err) => console.error("Failed to check setup status:", err));
  }, [router]);

  return <>{children}</>;
}
