import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { GalleryVerticalEnd, LoaderCircle, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

export const Route = createFileRoute("/(auth)/reset-password")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: (search.token as string) || "",
  }),
  component: ResetPasswordForm,
});

function ResetPasswordForm() {
  const { token } = useSearch({ from: "/(auth)/reset-password" });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <div className="flex flex-col gap-6 items-center">
        <div className="flex h-8 w-8 items-center justify-center rounded-md">
          <GalleryVerticalEnd className="size-6" />
        </div>
        <h1 className="text-xl font-bold">Invalid Reset Link</h1>
        <p className="text-muted-foreground text-center text-sm max-w-xs">
          This password reset link is invalid or has expired. Please request a
          new one.
        </p>
        <Link to="/forgot-password">
          <Button variant="outline">Request New Link</Button>
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isLoading) return;

    const formData = new FormData(e.currentTarget);
    const newPassword = formData.get("password") as string;
    const confirmPassword = formData.get("confirmPassword") as string;

    if (!newPassword || !confirmPassword) return;

    if (newPassword !== confirmPassword) {
      setErrorMessage("Passwords do not match");
      return;
    }

    if (newPassword.length < 8) {
      setErrorMessage("Password must be at least 8 characters");
      return;
    }

    setIsLoading(true);
    setErrorMessage("");

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ newPassword, token }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.message || "Failed to reset password. The link may have expired."
        );
      }
      setSuccess(true);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Something went wrong"
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col gap-6 items-center">
        <div className="flex h-8 w-8 items-center justify-center rounded-md">
          <GalleryVerticalEnd className="size-6" />
        </div>
        <h1 className="text-xl font-bold">Password Reset!</h1>
        <p className="text-muted-foreground text-center text-sm max-w-xs">
          Your password has been reset successfully. You can now log in with your
          new password.
        </p>
        <Link to="/login">
          <Button>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Go to Login
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md">
              <GalleryVerticalEnd className="size-6" />
            </div>
            <h1 className="text-xl font-bold">Set New Password</h1>
            <p className="text-muted-foreground text-center text-sm max-w-xs">
              Enter your new password below.
            </p>
          </div>
          <div className="flex flex-col gap-5">
            <div className="grid gap-2">
              <Label htmlFor="password">New Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Min 8 characters"
                readOnly={isLoading}
                required
                minLength={8}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                placeholder="Re-enter password"
                readOnly={isLoading}
                required
                minLength={8}
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={isLoading}
            >
              {isLoading && <LoaderCircle className="animate-spin" />}
              {isLoading ? "Resetting..." : "Reset Password"}
            </Button>
          </div>
          {errorMessage && (
            <span className="text-destructive text-center text-sm">
              {errorMessage}
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
