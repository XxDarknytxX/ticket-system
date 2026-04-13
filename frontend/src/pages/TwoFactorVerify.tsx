import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { TwoFactor } from "../services/api";
import { ShieldCheck, Key } from "lucide-react";

export default function TwoFactorVerify() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isBackupMode, setIsBackupMode] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const tempToken = localStorage.getItem("tempToken") || "";
  const pendingRole = localStorage.getItem("pendingRole") || "";

  const handleVerify = async () => {
    if (!code.trim()) { setError("Enter a code"); return; }
    setLoading(true);
    setError("");
    try {
      const data = await TwoFactor.verifyLogin(tempToken, code.trim());
      // Clear temp state, store real token
      localStorage.removeItem("tempToken");
      localStorage.removeItem("pendingRole");
      localStorage.setItem("token", data.token);
      localStorage.setItem("role", data.role);
      navigate("/");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (!tempToken) {
    navigate("/login");
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="card p-6 sm:p-8 space-y-6">
          {/* Header */}
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-8 h-8 text-violet-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Two-Factor Authentication</h1>
            <p className="text-sm text-slate-500 mt-1">
              {isBackupMode
                ? "Enter one of your backup codes"
                : "Enter the 6-digit code from your authenticator app"}
            </p>
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
              <p className="text-sm text-rose-700 font-medium">{error}</p>
            </div>
          )}

          <div>
            <input
              type="text"
              inputMode={isBackupMode ? "text" : "numeric"}
              maxLength={isBackupMode ? 8 : 6}
              value={code}
              onChange={(e) => setCode(isBackupMode ? e.target.value : e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && handleVerify()}
              className="w-full text-center text-2xl font-mono tracking-[0.3em] border border-slate-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none"
              placeholder={isBackupMode ? "backup code" : "000000"}
              autoFocus
            />
          </div>

          <button
            onClick={handleVerify}
            disabled={loading || !code.trim()}
            className="w-full btn-primary py-3 text-sm disabled:opacity-50"
          >
            {loading ? "Verifying..." : "Verify"}
          </button>

          <div className="text-center">
            <button
              onClick={() => { setIsBackupMode(!isBackupMode); setCode(""); setError(""); }}
              className="text-xs text-violet-600 font-medium hover:text-violet-700 flex items-center gap-1 mx-auto"
            >
              <Key className="w-3 h-3" />
              {isBackupMode ? "Use authenticator code instead" : "Use a backup code"}
            </button>
          </div>

          <div className="text-center">
            <button
              onClick={() => {
                localStorage.removeItem("tempToken");
                localStorage.removeItem("pendingRole");
                navigate("/login");
              }}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              Back to login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
