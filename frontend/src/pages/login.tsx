import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Auth, Settings } from "../services/api";
import { Mail, Lock, Ship, Anchor, Eye, EyeOff, ArrowRight, ShieldCheck } from "lucide-react";

function applyThemeColor(hex: string) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
  const r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255;
  const mx = Math.max(r,g,b), mn = Math.min(r,g,b), d = mx - mn;
  let h = 0; const l = (mx+mn)/2; const s = d === 0 ? 0 : d/(1-Math.abs(2*l-1));
  if (d !== 0) {
    if (mx === r) h = ((g-b)/d) % 6;
    else if (mx === g) h = (b-r)/d + 2;
    else h = (r-g)/d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  const toHex = (hh: number, ss: number, ll: number) => {
    ss /= 100; ll /= 100;
    const a = ss * Math.min(ll, 1 - ll);
    const f = (n: number) => { const k = (n + hh/30) % 12; return ll - a * Math.max(Math.min(k-3, 9-k, 1), -1); };
    return '#' + [f(0), f(8), f(4)].map(v => Math.round(v*255).toString(16).padStart(2, '0')).join('');
  };
  const shades: Record<string, number> = {'50':97,'100':93,'200':85,'300':72,'400':60,'500':50,'600':42,'700':34,'800':26,'900':18,'950':12};
  const caps: Record<string, number> = {'50':100,'100':95,'200':90,'300':85,'400':80,'500':75,'600':72,'700':70,'800':65,'900':60,'950':55};
  const ss = s * 100;
  Object.entries(shades).forEach(([k, lv]) => {
    document.documentElement.style.setProperty(`--color-violet-${k}`, toHex(h, Math.min(ss, caps[k]), lv));
  });
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const navigate = useNavigate();

  // Fetch server-side theme color so login page matches the admin's selected theme
  // even on fresh browsers (before any login has happened).
  useEffect(() => {
    (async () => {
      try {
        const data = await Settings.getPublicSettings();
        const color = data?.settings?.primary_color;
        if (color) {
          applyThemeColor(color);
          localStorage.setItem('theme_primary_color', color);
        }
      } catch { /* offline / server down — fall back to localStorage default */ }
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const { token, role } = await Auth.login(email, password);
      localStorage.setItem("token", token);
      localStorage.setItem("role", role);
      // Navigate to "/" which triggers RoleRedirect — it fetches permissions
      // and sends the user to their first permitted page (no flash of unauthorized pages)
      navigate("/");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex relative overflow-hidden">
      {/* Left Panel - Brand */}
      <div className="hidden lg:flex lg:w-[45%] relative overflow-hidden flex-col items-center justify-center bg-slate-950">
        {/* Base theme wash — large soft radial that fills the panel with accent,
            but still dark enough for white text to stay legible */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(ellipse 90% 80% at 50% 45%, color-mix(in srgb, var(--color-violet-900) 80%, transparent) 0%, color-mix(in srgb, var(--color-violet-950) 70%, transparent) 55%, transparent 100%)',
          }}
        />

        {/* Animated diagonal gradient — theme tint that slowly drifts */}
        <div
          className="absolute inset-0 opacity-70"
          style={{
            backgroundImage:
              'linear-gradient(135deg, color-mix(in srgb, var(--color-violet-800) 45%, transparent) 0%, transparent 35%, color-mix(in srgb, var(--color-violet-700) 35%, transparent) 65%, color-mix(in srgb, var(--color-violet-900) 50%, transparent) 100%)',
            backgroundSize: '240% 240%',
            animation: 'gradientShift 14s ease infinite',
          }}
        />

        {/* Subtle grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />

        {/* Floating gradient orbs — larger, more spread */}
        <div
          className="absolute top-[8%] -left-[12%] w-[620px] h-[620px] rounded-full animate-orb-drift"
          style={{
            backgroundImage:
              'radial-gradient(circle, color-mix(in srgb, var(--color-violet-500) 35%, transparent) 0%, color-mix(in srgb, var(--color-violet-600) 15%, transparent) 40%, transparent 75%)',
            filter: 'blur(85px)',
          }}
        />
        <div
          className="absolute -bottom-[15%] -right-[15%] w-[560px] h-[560px] rounded-full animate-pulse-glow"
          style={{
            backgroundImage:
              'radial-gradient(circle, color-mix(in srgb, var(--color-violet-400) 28%, transparent) 0%, transparent 70%)',
            filter: 'blur(75px)',
            animationDelay: '1.5s',
          }}
        />
        <div
          className="absolute top-[45%] right-[10%] w-[360px] h-[360px] rounded-full animate-float-slow"
          style={{
            backgroundImage:
              'radial-gradient(circle, color-mix(in srgb, var(--color-violet-500) 25%, transparent) 0%, transparent 70%)',
            filter: 'blur(65px)',
          }}
        />

        <div className="relative z-10 text-center px-12 max-w-md animate-fade-in-up">
          {/* Logo */}
          <div className="relative inline-flex items-center justify-center mb-8 animate-float">
            <div
              className="absolute inset-0 rounded-2xl blur-xl opacity-70"
              style={{
                background:
                  'radial-gradient(circle, color-mix(in srgb, var(--color-violet-500) 60%, transparent) 0%, transparent 70%)',
              }}
            />
            <div className="relative w-20 h-20 bg-white/[0.06] border border-white/10 rounded-2xl backdrop-blur-sm flex items-center justify-center">
              <Ship className="w-10 h-10 text-violet-300" strokeWidth={1.75} />
            </div>
          </div>

          <h1
            className="text-4xl font-bold tracking-tight mb-2"
            style={{
              backgroundImage:
                'linear-gradient(135deg, #ffffff 0%, var(--color-violet-200) 50%, var(--color-violet-300) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            Goundar Shipping
          </h1>
          <p className="text-[11px] font-semibold text-violet-300/70 mb-6 tracking-[0.3em] uppercase">
            Limited &middot; Fiji
          </p>

          <div className="w-20 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent mx-auto mb-6" />

          <p className="text-lg text-slate-200/90 font-light mb-3">
            Ticket Management System
          </p>
          <p className="text-[13px] text-slate-400/80 leading-relaxed max-w-xs mx-auto">
            Manage vessel bookings, passengers, and operations across all routes.
          </p>
        </div>

        {/* Bottom wave */}
        <div className="absolute bottom-0 left-0 right-0 z-[5]">
          <svg
            className="w-full"
            viewBox="0 0 1440 100"
            fill="none"
            preserveAspectRatio="none"
            style={{ height: '110px' }}
          >
            <path
              d="M0 60 C360 100 720 20 1080 70 C1260 90 1380 50 1440 60 L1440 100 L0 100 Z"
              fill="color-mix(in srgb, var(--color-violet-500) 10%, transparent)"
            />
            <path
              d="M0 80 C480 50 960 90 1440 70 L1440 100 L0 100 Z"
              fill="color-mix(in srgb, var(--color-violet-500) 6%, transparent)"
            />
          </svg>
        </div>
      </div>

      {/* Right Panel - Form (Glass card on white background with theme touch) */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-12 relative overflow-hidden bg-white">
        {/* Subtle theme-aware ambient glows */}
        <div
          className="absolute top-[-10%] right-[-10%] w-[520px] h-[520px] rounded-full pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle, color-mix(in srgb, var(--color-violet-400) 18%, transparent) 0%, transparent 70%)',
            filter: 'blur(75px)',
          }}
        />
        <div
          className="absolute bottom-[-10%] left-[-10%] w-[460px] h-[460px] rounded-full pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle, color-mix(in srgb, var(--color-violet-300) 14%, transparent) 0%, transparent 70%)',
            filter: 'blur(65px)',
          }}
        />
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[560px] h-[560px] rounded-full pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle, color-mix(in srgb, var(--color-violet-200) 25%, transparent) 0%, transparent 70%)',
            filter: 'blur(90px)',
          }}
        />

        {/* Glass card wrapping the form */}
        <div className="w-full max-w-[400px] relative z-10 animate-fade-in-up">
          {/* Gradient border wrapper */}
          <div
            className="relative rounded-3xl p-[1px]"
            style={{
              backgroundImage:
                'linear-gradient(135deg, color-mix(in srgb, var(--color-violet-400) 35%, transparent) 0%, rgba(226,232,240,0.8) 30%, rgba(226,232,240,0.5) 70%, color-mix(in srgb, var(--color-violet-300) 25%, transparent) 100%)',
            }}
          >
            <div className="bg-white/85 backdrop-blur-xl rounded-3xl shadow-[0_20px_60px_-15px_rgba(15,23,42,0.15)] p-8 sm:p-10">
              {/* Logo + Heading (centered) */}
              <div className="flex flex-col items-center text-center mb-8">
                {/* Logo */}
                <div className="relative mb-5">
                  {/* Soft glow behind logo */}
                  <div
                    className="absolute inset-0 rounded-2xl blur-xl"
                    style={{
                      backgroundImage:
                        'radial-gradient(circle, color-mix(in srgb, var(--color-violet-500) 45%, transparent) 0%, transparent 70%)',
                    }}
                  />
                  <div
                    className="relative w-16 h-16 rounded-2xl flex items-center justify-center animate-float"
                    style={{
                      backgroundImage:
                        'linear-gradient(135deg, var(--color-violet-500) 0%, var(--color-violet-600) 50%, var(--color-violet-700) 100%)',
                      boxShadow:
                        '0 10px 30px -8px color-mix(in srgb, var(--color-violet-600) 60%, transparent), inset 0 1px 0 0 rgba(255,255,255,0.25)',
                    }}
                  >
                    <Anchor className="w-8 h-8 text-white" strokeWidth={1.75} />
                  </div>
                </div>

                <h2 className="text-[22px] sm:text-[26px] font-bold text-slate-900 mb-1 tracking-tight leading-tight">
                  <span className="hidden sm:inline">Welcome back</span>
                  <span className="sm:hidden">Goundar Shipping</span>
                </h2>
                <p className="text-[13px] text-slate-500">
                  Enter your credentials to access the dashboard
                </p>
              </div>

              <form onSubmit={onSubmit} className="space-y-4">
                {/* Email */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-slate-700 tracking-wider uppercase">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail
                      className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 transition-all duration-300 ${
                        emailFocused ? 'scale-110' : ''
                      }`}
                      style={{
                        color: emailFocused ? 'var(--color-violet-500)' : '#94a3b8',
                      }}
                    />
                    <input
                      type="email"
                      className="w-full pl-11 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-4 focus:bg-white transition-all duration-200"
                      style={{
                        boxShadow: emailFocused
                          ? `0 0 0 4px color-mix(in srgb, var(--color-violet-500) 10%, transparent)`
                          : undefined,
                        borderColor: emailFocused
                          ? 'color-mix(in srgb, var(--color-violet-400) 80%, transparent)'
                          : undefined,
                      }}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onFocus={() => setEmailFocused(true)}
                      onBlur={() => setEmailFocused(false)}
                      placeholder="you@example.com"
                      autoComplete="email"
                      required
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-[11px] font-semibold text-slate-700 tracking-wider uppercase">
                      Password
                    </label>
                    <button
                      type="button"
                      className="text-[11px] font-medium transition-colors hover:underline"
                      style={{ color: 'var(--color-violet-600)' }}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock
                      className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 transition-all duration-300 ${
                        passwordFocused ? 'scale-110' : ''
                      }`}
                      style={{
                        color: passwordFocused ? 'var(--color-violet-500)' : '#94a3b8',
                      }}
                    />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="w-full pl-11 pr-11 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-[13px] text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white transition-all duration-200"
                      style={{
                        boxShadow: passwordFocused
                          ? `0 0 0 4px color-mix(in srgb, var(--color-violet-500) 10%, transparent)`
                          : undefined,
                        borderColor: passwordFocused
                          ? 'color-mix(in srgb, var(--color-violet-400) 80%, transparent)'
                          : undefined,
                      }}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={() => setPasswordFocused(true)}
                      onBlur={() => setPasswordFocused(false)}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors duration-200 p-1.5 rounded-lg hover:bg-slate-100"
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Error */}
                {err && (
                  <div className="animate-scale-in flex items-start gap-2.5 bg-rose-50 border border-rose-200/60 rounded-xl p-3">
                    <div className="w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-rose-600 text-[11px] font-bold">!</span>
                    </div>
                    <p className="text-rose-600 text-[13px] font-medium">{err}</p>
                  </div>
                )}

                {/* Submit — theme colored */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="group relative w-full flex items-center justify-center gap-2 text-white font-semibold rounded-2xl px-5 py-3.5 text-[13px] transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed overflow-hidden"
                    style={{
                      backgroundImage: loading
                        ? 'linear-gradient(135deg, #cbd5e1, #94a3b8)'
                        : 'linear-gradient(135deg, var(--color-violet-600) 0%, var(--color-violet-500) 50%, var(--color-violet-700) 100%)',
                      boxShadow: loading
                        ? 'none'
                        : '0 10px 30px -10px color-mix(in srgb, var(--color-violet-600) 60%, transparent), 0 4px 12px -4px color-mix(in srgb, var(--color-violet-600) 40%, transparent)',
                    }}
                  >
                    {/* Shimmer effect on hover */}
                    <span
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                      style={{
                        backgroundImage:
                          'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.25) 50%, transparent 70%)',
                        backgroundSize: '200% 100%',
                        animation: 'shimmer 2s linear infinite',
                      }}
                    />
                    {loading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        <span className="relative">Signing in...</span>
                      </>
                    ) : (
                      <>
                        <span className="relative">Sign In to Dashboard</span>
                        <ArrowRight className="w-4 h-4 relative transition-transform duration-200 group-hover:translate-x-1" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Footer below card */}
          <div className="mt-6 flex items-center justify-between text-[11px] text-slate-400 px-2">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3" />
              Protected by encryption
            </span>
            <span className="flex items-center gap-1">
              Goundar Shipping
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold ml-1"
                style={{
                  color: 'var(--color-violet-700)',
                  backgroundColor: 'color-mix(in srgb, var(--color-violet-500) 10%, white)',
                }}
              >
                v3.0
              </span>
            </span>
          </div>
        </div>

        {/* Copyright — centered at bottom of right panel */}
        <div className="absolute bottom-4 left-0 right-0 text-center text-[10px] text-slate-400 tracking-wide pointer-events-none z-10">
          &copy; 2026 Fusion IT. All rights reserved.
        </div>
      </div>
    </div>
  );
}
