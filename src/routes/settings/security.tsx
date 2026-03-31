import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  AlertTriangle,
  CheckCircle,
  Copy,
  Key,
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

interface TwoFactorSetup {
  totpURI: string;
  backupCodes: string[];
  secret: string;
}

function extractSecretFromURI(uri: string): string {
  try {
    const url = new URL(uri);
    return url.searchParams.get("secret") || "";
  } catch {
    return "";
  }
}

export function SecuritySettings() {
  const { data: session } = authClient.useSession();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(
    () => !!(session?.user as Record<string, unknown>)?.twoFactorEnabled,
  );
  const [twoFactorSetup, setTwoFactorSetup] = useState<TwoFactorSetup | null>(null);
  const [twoFactorPassword, setTwoFactorPassword] = useState("");
  const [twoFactorError, setTwoFactorError] = useState("");
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [savedBackupCodes, setSavedBackupCodes] = useState<string[]>([]);

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

  const handleRequestEnable2FA = async () => {
    setTwoFactorError("");

    if (!twoFactorPassword) {
      setTwoFactorError("Please enter your password");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/security/enable-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: twoFactorPassword }),
      });

      if (response.ok) {
        const data = await response.json();
        const secret = extractSecretFromURI(data.totpURI);
        setTwoFactorSetup({
          totpURI: data.totpURI,
          backupCodes: data.backupCodes || [],
          secret,
        });
        setSavedBackupCodes(data.backupCodes || []);
        setTwoFactorEnabled(true);
      } else {
        const errorData = await response.json();
        setTwoFactorError(errorData.error || "Failed to enable 2FA");
      }
    } catch {
      setTwoFactorError("Failed to enable 2FA");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmSetup = () => {
    setTwoFactorSetup(null);
    setTwoFactorPassword("");
    setShowBackupCodes(true);
    toast.success("Two-factor authentication enabled");
  };

  const handleDisable2FA = async () => {
    setTwoFactorError("");

    if (!twoFactorPassword) {
      setTwoFactorError("Please enter your password to disable 2FA");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/security/disable-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: twoFactorPassword }),
      });

      if (response.ok) {
        setTwoFactorEnabled(false);
        setTwoFactorPassword("");
        setSavedBackupCodes([]);
        setShowBackupCodes(false);
        toast.success("Two-factor authentication disabled");
      } else {
        const errorData = await response.json();
        setTwoFactorError(errorData.error || "Failed to disable 2FA");
      }
    } catch {
      setTwoFactorError("Failed to disable 2FA");
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard");
  };

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
              {twoFactorEnabled ? "Enabled" : "Disabled"}
            </Badge>
          </div>

          {/* Setup Flow - Show QR Code */}
          {twoFactorSetup && (
            <div className="space-y-6 p-4 border rounded-lg">
              <div className="text-center">
                <h3 className="font-semibold mb-2">Scan QR Code</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Scan this QR code with your authenticator app (Google
                  Authenticator, Authy, etc.)
                </p>
                <div className="flex justify-center mb-4">
                  <div className="p-4 bg-white rounded-lg">
                    <QRCodeSVG value={twoFactorSetup.totpURI} size={200} />
                  </div>
                </div>
              </div>

              {/* Manual Entry */}
              <div className="space-y-2">
                <Label>Or enter this code manually:</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-3 bg-muted rounded font-mono text-sm break-all">
                    {twoFactorSetup.secret}
                  </code>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(twoFactorSetup.secret)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Backup Codes */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  Save Your Backup Codes
                </Label>
                <p className="text-sm text-muted-foreground">
                  Store these codes in a safe place. You can use them to access
                  your account if you lose your authenticator.
                </p>
                <div className="grid grid-cols-2 gap-2 p-4 bg-muted rounded-lg">
                  {twoFactorSetup.backupCodes.map((code, index) => (
                    <code
                      key={index}
                      className="text-sm font-mono p-2 bg-background rounded text-center"
                    >
                      {code}
                    </code>
                  ))}
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    copyToClipboard(twoFactorSetup.backupCodes.join("\n"))
                  }
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy All Codes
                </Button>
              </div>

              <Button onClick={handleConfirmSetup} className="w-full">
                <CheckCircle className="h-4 w-4 mr-2" />
                I've Saved My Backup Codes
              </Button>
            </div>
          )}

          {/* Show saved backup codes if 2FA is enabled */}
          {twoFactorEnabled &&
            !twoFactorSetup &&
            showBackupCodes &&
            savedBackupCodes.length > 0 && (
              <div className="space-y-2">
                <Label>Your Backup Codes</Label>
                <div className="grid grid-cols-2 gap-2 p-4 bg-muted rounded-lg">
                  {savedBackupCodes.map((code, index) => (
                    <code
                      key={index}
                      className="text-sm font-mono p-2 bg-background rounded text-center"
                    >
                      {code}
                    </code>
                  ))}
                </div>
              </div>
            )}

          {/* Enable/Disable Controls */}
          {!twoFactorSetup && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="twoFactorPassword">
                  {twoFactorEnabled
                    ? "Enter password to disable 2FA"
                    : "Enter password to enable 2FA"}
                </Label>
                <Input
                  id="twoFactorPassword"
                  type="password"
                  value={twoFactorPassword}
                  onChange={(e) => setTwoFactorPassword(e.target.value)}
                  placeholder="Your account password"
                />
              </div>

              {twoFactorError && (
                <div className="text-sm text-destructive flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  {twoFactorError}
                </div>
              )}

              {!twoFactorEnabled ? (
                <Button
                  onClick={handleRequestEnable2FA}
                  disabled={isSubmitting || !twoFactorPassword}
                  className="w-full"
                >
                  {isSubmitting
                    ? "Setting up..."
                    : "Enable Two-Factor Authentication"}
                </Button>
              ) : (
                <Button
                  onClick={handleDisable2FA}
                  disabled={isSubmitting || !twoFactorPassword}
                  variant="destructive"
                  className="w-full"
                >
                  {isSubmitting
                    ? "Disabling..."
                    : "Disable Two-Factor Authentication"}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
