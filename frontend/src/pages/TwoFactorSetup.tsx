import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { TwoFactor } from "../services/api";
import { QRCodeSVG } from "qrcode.react";
import { ShieldCheck, Copy, CheckCircle, Key } from "lucide-react";

export default function TwoFactorSetup() {
  const [step, setStep] = useState<"qr" | "verify" | "backup">("qr");
  const [secret, setSecret] = useState("");
  const [otpauthUri, setOtpauthUri] = useState("");
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [backupCopied, setBackupCopied] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { navigate("/login"); return; }

    TwoFactor.setup()
      .then((data) => {
        setSecret(data.secret);
        setOtpauthUri(data.otpauthUri);
      })
      .catch((e) => setError(e.message));
  }, [navigate]);

  const handleVerify = async () => {
    if (code.length < 6) { setError("Enter a 6-digit code"); return; }
    setLoading(true);
    setError("");
    try {
      const data = await TwoFactor.verify(code);
      setBackupCodes(data.backupCodes || []);
      setStep("backup");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    setBackupCopied(true);
    setTimeout(() => setBackupCopied(false), 2000);
  };

  const handleDone = () => {
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="card p-6 sm:p-8 space-y-6">
          {/* Header */}
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-8 h-8 text-violet-600" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">
              {step === "backup" ? "Save Backup Codes" : "Set Up Two-Factor Authentication"}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {step === "qr" && "Scan the QR code with your authenticator app"}
              {step === "verify" && "Enter the 6-digit code from your authenticator app"}
              {step === "backup" && "Store these codes safely — they can be used if you lose your authenticator"}
            </p>
          </div>

          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
              <p className="text-sm text-rose-700 font-medium">{error}</p>
            </div>
          )}

          {/* Step 1: QR Code */}
          {step === "qr" && otpauthUri && (
            <div className="space-y-5">
              <div className="flex justify-center">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                  <QRCodeSVG value={otpauthUri} size={200} level="M" />
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Manual Entry Key</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-slate-100 rounded-lg px-3 py-2 text-sm font-mono text-slate-800 break-all">
                    {secret}
                  </code>
                  <button
                    onClick={copySecret}
                    className="p-2 rounded-lg hover:bg-slate-100 transition-colors flex-shrink-0"
                    title="Copy"
                  >
                    {copied ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-400" />}
                  </button>
                </div>
              </div>

              <button
                onClick={() => setStep("verify")}
                className="w-full btn-primary py-3 text-sm"
              >
                I've scanned the QR code
              </button>
            </div>
          )}

          {/* Step 2: Verify */}
          {step === "verify" && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Verification Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && handleVerify()}
                  className="w-full text-center text-2xl font-mono tracking-[0.5em] border border-slate-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500 outline-none"
                  placeholder="000000"
                  autoFocus
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep("qr")}
                  className="flex-1 btn-secondary py-3 text-sm"
                >
                  Back
                </button>
                <button
                  onClick={handleVerify}
                  disabled={loading || code.length < 6}
                  className="flex-1 btn-primary py-3 text-sm disabled:opacity-50"
                >
                  {loading ? "Verifying..." : "Verify & Enable"}
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Backup Codes */}
          {step === "backup" && (
            <div className="space-y-5">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                  <p className="text-sm font-bold text-emerald-800">2FA Enabled Successfully</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    <Key className="w-3 h-3 inline mr-1" />
                    Backup Codes (save these!)
                  </p>
                  <button
                    onClick={copyBackupCodes}
                    className="text-xs text-violet-600 font-medium hover:text-violet-700 flex items-center gap-1"
                  >
                    {backupCopied ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {backupCopied ? "Copied" : "Copy all"}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {backupCodes.map((c, i) => (
                    <code key={i} className="bg-slate-100 rounded-lg px-3 py-2 text-sm font-mono text-slate-800 text-center">
                      {c}
                    </code>
                  ))}
                </div>
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
                  Each code can only be used once. Store them somewhere safe.
                </p>
              </div>

              <button
                onClick={handleDone}
                className="w-full btn-primary py-3 text-sm"
              >
                I've saved my codes — Continue
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
