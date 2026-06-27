"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { observeAuth } from "@/lib/firebase/auth";
import type { User } from "firebase/auth";

export function useRequireAuth() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = observeAuth((u) => {
      if (u) {
        setUser(u);
      } else {
        router.replace("/sign-in");
      }
      setLoading(false);
    });
    return unsubscribe;
  }, [router]);

  return { user, loading };
}
