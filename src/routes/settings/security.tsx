import { useReducer, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  AlertTriangle,
  CheckCircle,
  Copy,
  Download,
  Key,
  RefreshCw,
  Shield,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from '@/lib/toast';
import authClient from "@/lib/auth/auth-client";
import {
  backupCodesFile,
  isCodeComplete,
  normalizeCode,
  setupReducer,
  twoFactorErrorMessage,
} from "@/lib/auth/two-factor";
import { useAuthOptions } from "@/lib/auth/use-auth-options";

export function SecuritySettings() {
  const { data: session } = authClient.useSession();
  const { emailOtp } = useAuthOptions();
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Enabled comes from the server's session user, never local state: the old
  // page flipped a local flag after enable and showed "Enabled" while the
  // server still had 2FA off (#299).
  const twoFactorEnabled = !!(session?.user as { twoFactorEnabled?: boolean } | undefined)?.twoFactorEnabled;
  const [setup, dispatch] = useReducer(setupReducer, { step: "idle" });
  const [twoFactorPassword, setTwoFactorPassword] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [twoFactorError, setTwoFactorError] = useState("");
  const [freshBackupCodes, setFreshBackupCodes] = useState<string[]>([]);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const handlePasswordChange = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPasswordError("");
    setPasswordSuccess(false);

    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters long");
      return;
    }

    setIsSubmitting(true);
    try {
      await authClient.changePassword({
        currentPassword,
        newPassword,
      });
      setPasswordSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed successfully");
    } catch (error) {
      setPasswordError(
        error instanceof Error ? error.message : "Failed to change password",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const requirePassword = (action: string) => {
    if (twoFactorPassword) return true;
    setTwoFactorError(`Enter your password to ${action}`);
    return false;
  };

  // Step 1: password → secret + QR + backup codes. 2FA is NOT on yet.
  const handleStartSetup = async () => {
    setTwoFactorError("");
    if (!requirePassword("set up two-factor")) return;
    setIsSubmitting(true);
    const { data, error } = await authClient.twoFactor.enable({ password: twoFactorPassword });
    setIsSubmitting(false);
    if (error || !data) {
      setTwoFactorError(twoFactorErrorMessage(error));
      return;
    }
    setTwoFactorPassword("");
    setVerifyCode("");
    dispatch({ type: "started", totpURI: data.totpURI, backupCodes: data.backupCodes ?? [] });
  };

  // Step 2: a code from the app proves the scan worked; this is what turns 2FA on.
  const handleVerifySetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFactorError("");
    if (!isCodeComplete("totp", verifyCode)) return;
    setIsSubmitting(true);
    const { error } = await authClient.twoFactor.verifyTotp({ code: verifyCode });
    setIsSubmitting(false);
    if (error) {
      setTwoFactorError(twoFactorErrorMessage(error));
      return;
    }
    dispatch({ type: "verified" });
    toast.success("Two-factor authentication is on");
  };

  const handleDisable2FA = async () => {
    setTwoFactorError("");
    if (!requirePassword("turn off two-factor")) return;
    setIsSubmitting(true);
    const { error } = await authClient.twoFactor.disable({ password: twoFactorPassword });
    setIsSubmitting(false);
    if (error) {
      setTwoFactorError(twoFactorErrorMessage(error));
      return;
    }
    setTwoFactorPassword("");
    setFreshBackupCodes([]);
    toast.success("Two-factor authentication turned off");
  };

  const handleRegenerateCodes = async () => {
    setTwoFactorError("");
    if (!requirePassword("make new backup codes")) return;
    setIsSubmitting(true);
    const { data, error } = await authClient.twoFactor.generateBackupCodes({ password: twoFactorPassword });
    setIsSubmitting(false);
    if (error || !data) {
      setTwoFactorError(twoFactorErrorMessage(error));
      return;
    }
    setTwoFactorPassword("");
    setFreshBackupCodes(data.backupCodes ?? []);
    toast.success("New backup codes made — the old ones no longer work");
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

  const downloadCodes = (codes: string[]) => {
    const blob = new Blob([backupCodesFile(codes, session?.user?.email)], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "aidj-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const backupCodesPanel = (codes: string[]) => (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-yellow-500" />
        Save your backup codes
      </Label>
      <p className="text-sm text-muted-foreground">
        Each code works once. They are the only way back in if you lose your
        authenticator app{emailOtp ? " and can't get email" : ""}.
      </p>
      <div className="grid grid-cols-2 gap-2 p-4 bg-muted rounded-lg">
        {codes.map((code) => (
          <code key={code} className="text-sm font-mono p-2 bg-background rounded text-center">
            {code}
          </code>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => copyToClipboard(codes.join("\n"))}>
          <Copy className="h-4 w-4 mr-2" />
          Copy
        </Button>
        <Button variant="outline" onClick={() => downloadCodes(codes)}>
          <Download className="h-4 w-4 mr-2" />
          Download
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Password Change */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Change Password
          </CardTitle>
          <CardDescription>
            Update your account password for better security
          </CardDescription>
        </CardHeader>
        <CardContent>
          {passwordSuccess ? (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <p className="text-lg font-medium">
                Password Changed Successfully!
              </p>
              <Button
                variant="outline"
                onClick={() => setPasswordSuccess(false)}
                className="mt-4"
              >
                Change Password Again
              </Button>
            </div>
          ) : (
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Current Password</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              {passwordError && (
                <div className="text-sm text-destructive">{passwordError}</div>
              )}
              <div className="flex justify-end pt-4">
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Changing..." : "Change Password"}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Two-Factor Authentication */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Two-Factor Authentication
          </CardTitle>
          <CardDescription>
            Add an extra layer of security to your account using an
            authenticator app
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Status */}
          <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
            <span className="font-medium">Status:</span>
            <Badge variant={twoFactorEnabled ? "default" : "secondary"}>
              {twoFactorEnabled ? "On" : "Off"}
            </Badge>
          </div>

          {/* Setup: scan + save codes + prove it works */}
          {setup.step === "scan" && (
            <div className="space-y-6 p-4 border rounded-lg">
              <div className="text-center">
                <h3 className="font-semibold mb-2">1. Scan this QR code</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Use an authenticator app (Google Authenticator, 1Password,
                  Authy, iOS Passwords…).
                </p>
                <div className="flex justify-center mb-4">
                  <div className="p-4 bg-white rounded-lg">
                    <QRCodeSVG value={setup.totpURI} size={200} />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Or enter this key manually:</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-3 bg-muted rounded font-mono text-sm break-all">
                    {setup.secret}
                  </code>
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(setup.secret)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold">2. Save your backup codes</h3>
                {backupCodesPanel(setup.backupCodes)}
              </div>

              <form onSubmit={handleVerifySetup} className="space-y-2">
                <h3 className="font-semibold">3. Enter the 6-digit code from the app</h3>
                <p className="text-sm text-muted-foreground">
                  Two-factor turns on only after this code checks out.
                </p>
                <Input
                  value={verifyCode}
                  onChange={(e) => setVerifyCode(normalizeCode("totp", e.target.value))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="123456"
                  className="text-center font-mono text-lg tracking-[0.3em]"
                />
                {twoFactorError && (
                  <div className="text-sm text-destructive flex items-center gap-2">
                    <XCircle className="h-4 w-4" />
                    {twoFactorError}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => dispatch({ type: "cancelled" })}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting || !isCodeComplete("totp", verifyCode)}>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {isSubmitting ? "Checking..." : "Verify & turn on"}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {setup.step === "done" && (
            <div className="space-y-4 p-4 border rounded-lg">
              <p className="text-sm">
                Two-factor is on. Next time you sign in you&apos;ll be asked for
                a code{emailOtp ? " (from your app, or by email)" : " from your app"}.
              </p>
              {backupCodesPanel(setup.backupCodes)}
              <Button className="w-full" onClick={() => dispatch({ type: "acknowledged" })}>
                I&apos;ve saved my backup codes
              </Button>
            </div>
          )}

          {freshBackupCodes.length > 0 && setup.step === "idle" && backupCodesPanel(freshBackupCodes)}

          {/* Password-gated actions */}
          {setup.step === "idle" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="twoFactorPassword">Your password</Label>
                <Input
                  id="twoFactorPassword"
                  type="password"
                  value={twoFactorPassword}
                  onChange={(e) => setTwoFactorPassword(e.target.value)}
                  placeholder={twoFactorEnabled ? "Needed to change two-factor settings" : "Needed to set up two-factor"}
                  autoComplete="current-password"
                />
              </div>

              {twoFactorError && (
                <div className="text-sm text-destructive flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  {twoFactorError}
                </div>
              )}

              {!twoFactorEnabled ? (
                <Button onClick={handleStartSetup} disabled={isSubmitting || !twoFactorPassword} className="w-full">
                  {isSubmitting ? "Setting up..." : "Set up two-factor authentication"}
                </Button>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button variant="outline" onClick={handleRegenerateCodes} disabled={isSubmitting || !twoFactorPassword}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    New backup codes
                  </Button>
                  <Button variant="destructive" onClick={handleDisable2FA} disabled={isSubmitting || !twoFactorPassword}>
                    {isSubmitting ? "Working..." : "Turn off two-factor"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
