import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Ship, Lock, CheckCircle, ArrowRight } from "lucide-react";

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || "http://localhost:5000/api";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!token) { setError("Invalid reset link. No token provided."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reset password");

      setSuccess(true);
      setTimeout(() => navigate("/login"), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 bg-rose-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-rose-600 text-2xl font-bold">!</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Invalid Reset Link</h1>
          <p className="text-[13px] text-slate-500 mb-6">This password reset link is missing a token. Please request a new reset from your administrator.</p>
          <button onClick={() => navigate("/login")} className="bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-full px-6 py-2.5 text-[13px] transition-colors">
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex relative">
      {/* Left Panel - Brand */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden flex-col items-center justify-center bg-slate-900">
        <div className="absolute inset-0 opacity-[0.04]"
          style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(124,58,237,0.15) 0%, transparent 70%)', filter: 'blur(60px)' }} />

        <div className="relative z-10 text-center px-12 max-w-md">
          <div className="inline-flex items-center justify-center w-20 h-20 mb-8 bg-white/5 border border-white/10 rounded-2xl">
            <Ship className="w-10 h-10 text-violet-400" />
          </div>
          <h1 className="text-4xl font-bold text-white tracking-tight mb-2">Goundar Shipping</h1>
          <p className="text-sm font-semibold text-violet-400/80 mb-6 tracking-[0.2em] uppercase">Ltd</p>
          <div className="w-16 h-px bg-white/10 mx-auto mb-6" />
          <p className="text-lg text-slate-300/80 font-light">Reset Your Password</p>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-white relative">
        <div className="w-full max-w-sm">
          {/* Mobile branding */}
          <div className="lg:hidden text-center mb-10">
            <div className="inline-flex items-center justify-center w-14 h-14 mb-4 bg-slate-900 rounded-2xl">
              <Ship className="w-7 h-7 text-violet-400" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Goundar Shipping</h1>
          </div>

          {success ? (
            <div className="text-center animate-fade-in">
              <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <CheckCircle className="w-8 h-8 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Password Updated</h2>
              <p className="text-[13px] text-slate-500 mb-6">Your password has been successfully reset. Redirecting you to login...</p>
              <button
                onClick={() => navigate("/login")}
                className="bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-full px-6 py-2.5 text-[13px] flex items-center gap-2 mx-auto transition-colors"
              >
                Go to Login <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-slate-900 mb-1">Set new password</h2>
                <p className="text-[13px] text-slate-500">Enter your new password below</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-[13px] font-medium text-slate-700">New Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/15 focus:border-violet-400 transition-all"
                      placeholder="Minimum 6 characters"
                      minLength={6}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[13px] font-medium text-slate-700">Confirm Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/15 focus:border-violet-400 transition-all"
                      placeholder="Re-enter your password"
                      minLength={6}
                      required
                    />
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-2.5 bg-rose-50 border border-rose-200/60 rounded-xl p-3 animate-scale-in">
                    <div className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-rose-600 text-[11px] font-bold">!</span>
                    </div>
                    <p className="text-rose-600 text-[13px] font-medium">{error}</p>
                  </div>
                )}

                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-full px-5 py-3 text-[13px] flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
                        Resetting...
                      </>
                    ) : (
                      <>Reset Password <ArrowRight className="w-4 h-4" /></>
                    )}
                  </button>
                </div>
              </form>

              <div className="mt-8 text-center">
                <button onClick={() => navigate("/login")} className="text-[12px] text-violet-600 hover:text-violet-700 font-medium transition-colors">
                  Back to Login
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
