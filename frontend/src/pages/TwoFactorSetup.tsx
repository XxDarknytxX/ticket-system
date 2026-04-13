import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { TwoFactor } from "../services/api";
import { ShieldCheck, Copy, CheckCircle, Key, Smartphone, Lock, AlertCircle, Check, Loader, Download } from "lucide-react";

export default function TwoFactorSetup() {
  const [step, setStep] = useState(1);
  const [qrCode, setQrCode] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedText, setCopiedText] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) { navigate("/login"); return; }

    setLoading(true);
    TwoFactor.setup()
      .then((data) => {
        setQrCode(data.qrCode);
        setSecretKey(data.secret || data.manualEntryKey);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [navigate]);

  const steps = [
    { num: 1, title: "Scan QR", icon: Smartphone },
    { num: 2, title: "Verify", icon: Key },
    { num: 3, title: "Backup", icon: Lock },
  ];

  // Individual digit input handlers
  const handleDigitChange = (index: number, value: string) => {
    if (value && !/^\d$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    setError("");
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
    // Auto-submit when all 6 digits entered
    if (newCode.every(d => d) && newCode.join("").length === 6) {
      handleVerify(newCode.join(""));
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
      handleVerify(pasted);
    }
  };

  const handleVerify = async (codeStr = code.join("")) => {
    if (codeStr.length < 6) { setError("Enter a 6-digit code"); return; }
    setLoading(true);
    setError("");
    try {
      const data = await TwoFactor.verify(codeStr);
      // Replace setup-only token with full token from server
      if (data.token) {
        localStorage.setItem("token", data.token);
      }
      setBackupCodes(data.backupCodes || []);
      setStep(3);
    } catch (e: any) {
      setError(e.message);
      setCode(["", "", "", "", "", ""]);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(""), 2000);
  };

  const downloadBackupCodes = () => {
    const text = backupCodes.join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "goundar-shipping-backup-codes.txt";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-3 sm:p-4">
      <div className="w-full max-w-lg sm:max-w-2xl">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">

          {/* Header */}
          <div className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 lg:p-6 border-b border-slate-100">
            <div className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 bg-violet-600 rounded-lg sm:rounded-xl flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg lg:text-xl font-bold text-slate-900">Two-Factor Authentication</h3>
              <p className="text-xs text-slate-500 hidden lg:block">Secure your account with an extra layer of protection</p>
            </div>
          </div>

          {/* Progress */}
          <div className="px-3 sm:px-4 lg:px-6 py-3 sm:py-4 bg-slate-50/50">
            <div className="flex items-center justify-between max-w-xs sm:max-w-sm mx-auto">
              {steps.map((s, index) => {
                const Icon = s.icon;
                const isActive = step === s.num;
                const isCompleted = step > s.num;
                return (
                  <div key={s.num} className="flex items-center">
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12 rounded-full flex items-center justify-center font-semibold transition-all duration-300 ${
                        isActive ? "bg-violet-600 text-white shadow-lg scale-110"
                        : isCompleted ? "bg-slate-900 text-white"
                        : "bg-slate-200 text-slate-400"
                      }`}>
                        {isCompleted ? <Check className="w-4 h-4 sm:w-5 sm:h-5" /> : <Icon className="w-4 h-4 sm:w-5 sm:h-5" />}
                      </div>
                      <span className={`text-[10px] sm:text-xs font-medium mt-1 sm:mt-2 whitespace-nowrap ${
                        isActive ? "text-slate-900" : isCompleted ? "text-slate-700" : "text-slate-400"
                      }`}>{s.title}</span>
                    </div>
                    {index < steps.length - 1 && (
                      <div className={`flex-shrink-0 w-8 sm:w-12 lg:w-16 h-0.5 -mt-5 mx-1 ${
                        step > s.num ? "bg-slate-900" : "bg-slate-300"
                      }`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Content */}
          <div className="p-3 sm:p-4 lg:p-6">

            {error && (
              <div className="mb-4 p-3 sm:p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 sm:gap-3">
                <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-rose-600 flex-shrink-0" />
                <p className="text-rose-800 text-xs sm:text-sm">{error}</p>
              </div>
            )}

            {/* Step 1: Scan QR */}
            {step === 1 && (
              <div className="space-y-3 sm:space-y-4 lg:space-y-6 max-w-lg mx-auto">
                <div className="text-center sm:text-left">
                  <h2 className="text-base sm:text-lg lg:text-xl font-semibold text-slate-900 mb-1">Step 1: Scan QR Code</h2>
                  <p className="text-xs sm:text-sm text-slate-600">Open your authenticator app and scan this QR code</p>
                </div>

                <div className="flex justify-center p-4 sm:p-6 lg:p-8 bg-slate-50 rounded-xl">
                  {loading ? (
                    <div className="flex items-center justify-center h-[200px]">
                      <Loader className="w-8 h-8 text-slate-400 animate-spin" />
                    </div>
                  ) : qrCode ? (
                    <img src={qrCode} alt="2FA QR Code" className="w-[200px] h-[200px] sm:w-[256px] sm:h-[256px]" />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-[200px] text-slate-400">
                      <AlertCircle className="w-10 h-10 mb-2" />
                      <p className="text-sm">QR code unavailable</p>
                      <p className="text-xs mt-1">Use manual entry below</p>
                    </div>
                  )}
                </div>

                <div className="bg-slate-50 rounded-xl p-3 sm:p-4">
                  <p className="text-xs sm:text-sm text-slate-600 mb-2 sm:mb-3">Can't scan? Enter this code manually:</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={secretKey || "Loading..."}
                      readOnly
                      className="flex-1 font-mono text-xs sm:text-sm bg-white px-2 sm:px-3 py-2 sm:py-2.5 rounded-lg border border-slate-200 text-slate-900"
                    />
                    <button
                      onClick={() => copyToClipboard(secretKey, "Secret key")}
                      disabled={!secretKey}
                      className="p-2 sm:p-2.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 bg-white disabled:opacity-50"
                    >
                      {copiedText === secretKey ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => { setStep(2); setTimeout(() => inputRefs.current[0]?.focus(), 100); }}
                  disabled={!secretKey}
                  className="w-full btn-primary py-2.5 sm:py-3 text-sm sm:text-base disabled:opacity-50"
                >
                  Continue to Verification
                </button>
              </div>
            )}

            {/* Step 2: Verify */}
            {step === 2 && (
              <div className="space-y-3 sm:space-y-4 lg:space-y-6 max-w-lg mx-auto">
                <div className="text-center sm:text-left">
                  <h2 className="text-base sm:text-lg lg:text-xl font-semibold text-slate-900 mb-1">Step 2: Verify Setup</h2>
                  <p className="text-xs sm:text-sm text-slate-600">Enter the 6-digit code from your authenticator app</p>
                </div>

                {/* Individual digit inputs */}
                <div className="flex gap-2 justify-center">
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
                      className="w-11 h-14 sm:w-12 sm:h-14 text-center text-xl font-semibold bg-slate-50 border-2 border-slate-200 rounded-lg text-slate-900 focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition-all disabled:opacity-50"
                      autoFocus={index === 0}
                    />
                  ))}
                </div>

                <div className="flex gap-2 sm:gap-3">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 btn-secondary py-2.5 sm:py-3 text-sm sm:text-base"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => handleVerify()}
                    disabled={loading || code.join("").length !== 6}
                    className="flex-1 btn-primary py-2.5 sm:py-3 text-sm sm:text-base disabled:opacity-50 flex items-center justify-center"
                  >
                    {loading ? (
                      <><Loader className="w-4 h-4 animate-spin mr-2" />Verifying...</>
                    ) : "Verify & Enable"}
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Backup Codes */}
            {step === 3 && (
              <div className="space-y-3 sm:space-y-4 max-w-lg mx-auto">
                <div className="text-center mb-3 sm:mb-4">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-2 sm:mb-3">
                    <Check className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
                  </div>
                  <h2 className="text-base sm:text-lg font-semibold text-slate-900 mb-1">2FA Enabled Successfully!</h2>
                  <p className="text-xs sm:text-sm text-slate-600">Save these backup codes in a secure place</p>
                </div>

                <div className="bg-slate-50 rounded-xl p-2.5 sm:p-3 lg:p-4 max-h-[220px] overflow-y-auto">
                  <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                    {backupCodes.map((c, i) => (
                      <div key={i} className="flex items-center justify-between p-2 sm:p-2.5 bg-white rounded-lg font-mono text-xs sm:text-sm border border-slate-200">
                        <span className="text-slate-800">{c}</span>
                        <button
                          onClick={() => copyToClipboard(c, "Backup code")}
                          className={`p-1 rounded transition-colors ${copiedText === c ? "text-emerald-600" : "text-slate-400 hover:text-slate-600"}`}
                        >
                          {copiedText === c ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 sm:p-3">
                  <p className="text-amber-800 text-xs sm:text-sm flex items-start">
                    <AlertCircle className="w-3 h-3 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 mt-0.5 flex-shrink-0" />
                    Each backup code can only be used once. Store them securely!
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                  <button onClick={downloadBackupCodes} className="flex-1 btn-secondary py-2.5 sm:py-3 text-sm sm:text-base flex items-center justify-center gap-2">
                    <Download className="w-4 h-4" /> Download Codes
                  </button>
                  <button onClick={() => navigate("/dashboard")} className="flex-1 btn-primary py-2.5 sm:py-3 text-sm sm:text-base">
                    Complete Setup
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
