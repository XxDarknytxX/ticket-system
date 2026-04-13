import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { TwoFactor } from "../services/api";
import { ShieldCheck, AlertCircle, Loader, Info } from "lucide-react";

export default function TwoFactorVerify() {
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showBackupInput, setShowBackupInput] = useState(false);
  const [backupCode, setBackupCode] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const navigate = useNavigate();

  const tempToken = localStorage.getItem("tempToken") || "";

  useEffect(() => {
    if (!tempToken) { navigate("/login"); return; }
    setTimeout(() => inputRefs.current[0]?.focus(), 100);
  }, [tempToken, navigate]);

  const handleDigitChange = (index: number, value: string) => {
    if (value && !/^\d$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    setError("");
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
    if (newCode.every(d => d) && newCode.join("").length === 6) {
      submitCode(newCode.join(""));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setCode(pasted.split(""));
      inputRefs.current[5]?.focus();
      submitCode(pasted);
    }
  };

  const submitCode = async (codeStr: string) => {
    setLoading(true);
    setError("");
    try {
      const data = await TwoFactor.verifyLogin(tempToken, codeStr);
      localStorage.removeItem("tempToken");
      localStorage.removeItem("pendingRole");
      localStorage.setItem("token", data.token);
      localStorage.setItem("role", data.role);
      // Full page reload to ensure clean app state after 2FA
      window.location.href = window.location.pathname.replace(/2fa-verify.*/, "dashboard");
    } catch (e: any) {
      setError(e.message);
      setCode(["", "", "", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } finally {
      setLoading(false);
    }
  };

  const submitBackupCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = backupCode.replace(/[-\s]/g, "");
    if (!cleaned) { setError("Enter a backup code"); return; }
    setLoading(true);
    setError("");
    try {
      const data = await TwoFactor.verifyLogin(tempToken, cleaned);
      localStorage.removeItem("tempToken");
      localStorage.removeItem("pendingRole");
      localStorage.setItem("token", data.token);
      localStorage.setItem("role", data.role);
      // Full page reload to ensure clean app state after 2FA
      window.location.href = window.location.pathname.replace(/2fa-verify.*/, "dashboard");
    } catch (e: any) {
      setError(e.message);
      setBackupCode("");
    } finally {
      setLoading(false);
    }
  };

  if (!tempToken) return null;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden">

          {/* Header */}
          <div className="flex items-center gap-3 p-6 border-b border-slate-100 bg-slate-50">
            <div className="w-12 h-12 bg-violet-100 rounded-xl flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-violet-600" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Two-Factor Authentication</h3>
              <p className="text-sm text-slate-600">
                {showBackupInput ? "Enter your backup code" : "Enter verification code"}
              </p>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">

            {error && (
              <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3">
                <div className="w-10 h-10 bg-rose-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-5 h-5 text-rose-600" />
                </div>
                <div className="flex-1">
                  <p className="text-rose-800 text-sm font-semibold">Authentication Error</p>
                  <p className="text-rose-700 text-sm">{error}</p>
                </div>
              </div>
            )}

            {!showBackupInput ? (
              <>
                <p className="text-slate-700 text-sm mb-4 text-center">
                  Enter the 6-digit code from your authenticator app
                </p>

                {/* Individual digit inputs */}
                <div className="flex gap-2 justify-center mb-6">
                  {code.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => { inputRefs.current[index] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleDigitChange(index, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(index, e)}
                      onPaste={index === 0 ? handlePaste : undefined}
                      disabled={loading}
                      className="w-12 h-14 text-center text-xl font-semibold bg-slate-50 border-2 border-slate-200 rounded-lg text-slate-900 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-all disabled:opacity-50"
                      autoFocus={index === 0}
                    />
                  ))}
                </div>

                <button
                  onClick={() => submitCode(code.join(""))}
                  disabled={loading || code.join("").length !== 6}
                  className="w-full btn-primary py-3 text-sm disabled:opacity-50 flex items-center justify-center"
                >
                  {loading ? (
                    <><Loader className="w-4 h-4 animate-spin mr-2" />Verifying...</>
                  ) : "Verify Code"}
                </button>

                <div className="mt-4 text-center">
                  <button
                    onClick={() => { setShowBackupInput(true); setError(""); }}
                    className="text-sm text-violet-600 hover:text-violet-700 font-medium"
                  >
                    Use a backup code instead
                  </button>
                </div>
              </>
            ) : (
              <>
                <form onSubmit={submitBackupCode}>
                  <div className="mb-6">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Backup Code</label>
                    <input
                      type="text"
                      value={backupCode}
                      onChange={(e) => { setBackupCode(e.target.value.toUpperCase()); setError(""); }}
                      placeholder="XXXX-XXXX"
                      maxLength={9}
                      disabled={loading}
                      className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 font-mono text-center text-lg disabled:opacity-50"
                      autoFocus
                    />
                    <p className="mt-2 text-xs text-slate-500 text-center">Enter one of your 8-character backup codes</p>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || !backupCode.trim()}
                    className="w-full btn-primary py-3 text-sm disabled:opacity-50 flex items-center justify-center"
                  >
                    {loading ? (
                      <><Loader className="w-4 h-4 animate-spin mr-2" />Verifying...</>
                    ) : "Verify Backup Code"}
                  </button>
                </form>

                <div className="mt-4 text-center">
                  <button
                    onClick={() => {
                      setShowBackupInput(false);
                      setBackupCode("");
                      setError("");
                      setCode(["", "", "", "", "", ""]);
                      setTimeout(() => inputRefs.current[0]?.focus(), 100);
                    }}
                    className="text-sm text-violet-600 hover:text-violet-700 font-medium"
                  >
                    Back to verification code
                  </button>
                </div>
              </>
            )}

            {/* Info */}
            <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-3">
              <div className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center flex-shrink-0">
                <Info className="w-4 h-4 text-slate-600" />
              </div>
              <p className="text-slate-600 text-xs">
                {showBackupInput
                  ? "Each backup code can only be used once"
                  : "Never share your verification codes with anyone"}
              </p>
            </div>

            <div className="mt-4 text-center">
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
    </div>
  );
}
