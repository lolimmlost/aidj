import { createFileRoute, Link } from "@tanstack/react-router";
import { GalleryVerticalEnd, LoaderCircle, ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";

export const Route = createFileRoute("/(auth)/forgot-password")({
  component: ForgotPasswordForm,
});

function ForgotPasswordForm() {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isLoading) return;

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    if (!email) return;

    setIsLoading(true);
    setErrorMessage("");

    try {
      // better-auth exposes POST /api/auth/request-password-reset
      const res = await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email,
          redirectTo: "/reset-password",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.message || "Failed to send reset email");
      }
      // Always show success to avoid email enumeration
      setSuccess(true);
    } catch (err) {
      // Still show success to prevent email enumeration
      setSuccess(true);
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col gap-6 max-w-sm mx-auto">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md">
            <GalleryVerticalEnd className="size-6" />
          </div>
          <h1 className="text-xl font-bold">Check your email</h1>
          <p className="text-muted-foreground text-center text-sm max-w-xs">
            If an account exists with that email, we&apos;ve sent a password
            reset link. Check your inbox and spam folder.
          </p>
        </div>
        <Link to="/login">
          <Button variant="outline" className="w-full">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to login
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-sm mx-auto">
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-6">
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md">
              <GalleryVerticalEnd className="size-6" />
            </div>
            <h1 className="text-xl font-bold">Forgot your password?</h1>
            <p className="text-muted-foreground text-center text-sm max-w-xs">
              Enter your email and we&apos;ll send you a link to reset your
              password.
            </p>
          </div>
          <div className="flex flex-col gap-5">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="hello@example.com"
                readOnly={isLoading}
                required
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={isLoading}
            >
              {isLoading && <LoaderCircle className="animate-spin" />}
              {isLoading ? "Sending..." : "Send Reset Link"}
            </Button>
          </div>
          {errorMessage && (
            <span className="text-destructive text-center text-sm">
              {errorMessage}
            </span>
          )}
        </div>
      </form>
      <div className="text-center text-sm">
        <Link to="/login" className="underline underline-offset-4">
          Back to login
        </Link>
      </div>
    </div>
  );
}
