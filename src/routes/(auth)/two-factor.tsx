import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Disc3, KeyRound, LoaderCircle, Mail, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import authClient from "~/lib/auth/auth-client";
import {
  isChallengeExpired,
  isCodeComplete,
  normalizeCode,
  twoFactorErrorMessage,
  type TwoFactorMethod,
} from "~/lib/auth/two-factor";
import { useAuthOptions } from "~/lib/auth/use-auth-options";

/**
 * Second step of sign-in when the account has 2FA on. The login page lands
 * here after better-auth answers `{ twoFactorRedirect: true }`; the signed
 * challenge cookie it set is valid for 10 minutes and is what these calls use.
 */
export const Route = createFileRoute("/(auth)/two-factor")({
  component: TwoFactorChallenge,
});

const RESEND_COOLDOWN_S = 30;

function TwoFactorChallenge() {
  const { redirectUrl } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const { emailOtp } = useAuthOptions();

  const [method, setMethod] = useState<TwoFactorMethod>("totp");
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const switchMethod = (m: TwoFactorMethod) => {
    setMethod(m);
    setCode("");
    setError("");
  };

  const fail = (err: { code?: string; status?: number; message?: string } | null | undefined) => {
    setIsLoading(false);
    setError(twoFactorErrorMessage(err));
    if (isChallengeExpired(err)) setExpired(true);
  };

  const sendEmailCode = async () => {
    setError("");
    setIsLoading(true);
    // "Trust this device" is applied by verifyOtp, not here.
    const { error: err } = await authClient.twoFactor.sendOtp();
    setIsLoading(false);
    if (err) return fail(err);
    setOtpSent(true);
    setCooldown(RESEND_COOLDOWN_S);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading || !isCodeComplete(method, code)) return;
    setError("");
    setIsLoading(true);
    const body = { code, trustDevice };
    const { error: err } =
      method === "totp"
        ? await authClient.twoFactor.verifyTotp(body)
        : method === "otp"
          ? await authClient.twoFactor.verifyOtp(body)
          : await authClient.twoFactor.verifyBackupCode(body);
    if (err) return fail(err);
    queryClient.removeQueries({ queryKey: ["user"] });
    window.location.href = redirectUrl;
  };

  const numeric = method !== "backup";

  return (
    <div className="mx-auto w-full max-w-[400px]">
      <div className="mb-8">
        <div className="mb-4 inline-flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2">
          <Disc3 className="h-6 w-6 text-primary" />
          <span className="text-2xl font-bold tracking-tight">AIDJ</span>
        </div>
        <h1 className="text-xl font-bold tracking-tight">Two-step verification</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {method === "totp" && "Enter the 6-digit code from your authenticator app."}
          {method === "otp" && (otpSent ? "Enter the 6-digit code we emailed you." : "We'll email a 6-digit code to your account address.")}
          {method === "backup" && "Enter one of your saved backup codes."}
        </p>
      </div>

      {expired ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5">
            <p className="text-sm font-medium text-red-500 dark:text-red-400">{error}</p>
          </div>
          <Button asChild className="w-full min-h-[44px]" size="lg">
            <Link to="/login">Back to sign in</Link>
          </Button>
        </div>
      ) : (
        <>
          {method === "otp" && !otpSent ? (
            <Button
              type="button"
              className="w-full min-h-[44px]"
              size="lg"
              onClick={sendEmailCode}
              disabled={isLoading}
            >
              {isLoading ? <LoaderCircle className="animate-spin" /> : <Mail className="h-4 w-4" />}
              Email me a code
            </Button>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="code">{method === "backup" ? "Backup code" : "Code"}</Label>
                <Input
                  id="code"
                  name="code"
                  value={code}
                  onChange={(e) => setCode(normalizeCode(method, e.target.value))}
                  inputMode={numeric ? "numeric" : "text"}
                  autoComplete={numeric ? "one-time-code" : "off"}
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  pattern={numeric ? "[0-9]*" : undefined}
                  maxLength={numeric ? 6 : 11}
                  placeholder={numeric ? "123456" : "abcde-12345"}
                  autoFocus
                  readOnly={isLoading}
                  className="min-h-[44px] text-center font-mono text-lg tracking-[0.3em]"
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <Checkbox checked={trustDevice} onCheckedChange={(v) => setTrustDevice(v === true)} />
                Don&apos;t ask again on this device for 30 days
              </label>

              {error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5">
                  <p className="text-sm font-medium text-red-500 dark:text-red-400">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                className="w-full min-h-[44px]"
                size="lg"
                disabled={isLoading || !isCodeComplete(method, code)}
              >
                {isLoading && <LoaderCircle className="animate-spin" />}
                {isLoading ? "Checking..." : "Verify"}
              </Button>

              {method === "otp" && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={sendEmailCode}
                  disabled={isLoading || cooldown > 0}
                >
                  {cooldown > 0 ? `Send a new code in ${cooldown}s` : "Send a new code"}
                </Button>
              )}
            </form>
          )}

          <div className="mt-6 space-y-2 border-t border-border pt-4 text-sm">
            <p className="text-muted-foreground">Other ways to sign in:</p>
            <div className="flex flex-wrap gap-2">
              {method !== "totp" && (
                <Button variant="outline" size="sm" onClick={() => switchMethod("totp")}>
                  <Smartphone className="h-4 w-4" /> Authenticator app
                </Button>
              )}
              {emailOtp && method !== "otp" && (
                <Button variant="outline" size="sm" onClick={() => switchMethod("otp")}>
                  <Mail className="h-4 w-4" /> Email code
                </Button>
              )}
              {method !== "backup" && (
                <Button variant="outline" size="sm" onClick={() => switchMethod("backup")}>
                  <KeyRound className="h-4 w-4" /> Backup code
                </Button>
              )}
            </div>
            <p className="pt-2">
              <Link to="/login" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
                Use a different account
              </Link>
            </p>
          </div>
        </>
      )}
    </div>
  );
}
