"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: 8,
  marginBottom: 12,
  fontSize: 14,
  boxSizing: "border-box",
};

export default function AdminLoginPage() {
  const router = useRouter();
  // "set-password" is reached by clicking an invite/recovery link, which
  // Supabase's client fires a PASSWORD_RECOVERY auth event for once the
  // session from the link's token is established.
  const [mode, setMode] = useState<"signin" | "set-password">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("set-password");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("Invalid email or password.");
      return;
    }
    router.push("/admin/orders");
    router.refresh();
  }

  async function handleSetPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setError("Couldn't set password. Try requesting a new link.");
      return;
    }
    router.push("/admin/orders");
    router.refresh();
  }

  return (
    <div style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 360, margin: "80px auto" }}>
      <h1 style={{ fontSize: 22, marginBottom: 16 }}>
        {mode === "signin" ? "Admin login" : "Set your password"}
      </h1>

      {mode === "signin" ? (
        <form onSubmit={handleSignIn}>
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
          <input
            type="password"
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
          {error && <p style={{ color: "#b00", marginBottom: 12 }}>{error}</p>}
          <button type="submit" disabled={loading} style={{ padding: "8px 16px" }}>
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleSetPassword}>
          <p style={{ marginBottom: 12, color: "#666" }}>
            Choose a password for your admin account.
          </p>
          <input
            type="password"
            required
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
          <input
            type="password"
            required
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            style={inputStyle}
          />
          {error && <p style={{ color: "#b00", marginBottom: 12 }}>{error}</p>}
          <button type="submit" disabled={loading} style={{ padding: "8px 16px" }}>
            {loading ? "Saving..." : "Set password"}
          </button>
        </form>
      )}
    </div>
  );
}
