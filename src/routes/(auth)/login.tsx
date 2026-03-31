import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Disc3, Headphones, Music, LoaderCircle, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import authClient from "~/lib/auth/auth-client";

export const Route = createFileRoute("/(auth)/login")({
  component: LoginForm,
});

const SONGS_A = [
  { title: "Bohemian Rhapsody", artist: "Queen", initials: "QU", gradient: "from-rose-500 to-orange-500" },
  { title: "Blinding Lights", artist: "The Weeknd", initials: "TW", gradient: "from-red-500 to-pink-500" },
  { title: "Let It Happen", artist: "Tame Impala", initials: "TI", gradient: "from-purple-500 to-indigo-500" },
  { title: "Electric Feel", artist: "MGMT", initials: "MG", gradient: "from-cyan-500 to-blue-500" },
  { title: "Midnight City", artist: "M83", initials: "M8", gradient: "from-indigo-500 to-violet-500" },
  { title: "Redbone", artist: "Childish Gambino", initials: "CG", gradient: "from-amber-500 to-red-500" },
];

const SONGS_B = [
  { title: "Dreams", artist: "Fleetwood Mac", initials: "FM", gradient: "from-emerald-500 to-teal-500" },
  { title: "Nights", artist: "Frank Ocean", initials: "FO", gradient: "from-sky-500 to-indigo-500" },
  { title: "Starboy", artist: "The Weeknd", initials: "TW", gradient: "from-yellow-500 to-orange-500" },
  { title: "Somebody Else", artist: "The 1975", initials: "T1", gradient: "from-pink-500 to-rose-500" },
  { title: "Do I Wanna Know?", artist: "Arctic Monkeys", initials: "AM", gradient: "from-stone-500 to-zinc-500" },
  { title: "Ivy", artist: "Frank Ocean", initials: "FO", gradient: "from-green-500 to-emerald-500" },
];

const ALL_SONGS = [...SONGS_A, ...SONGS_B];

function SongCard({ song }: { song: typeof SONGS_A[0] }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-3">
      <div className={`h-12 w-12 shrink-0 rounded-lg bg-gradient-to-br ${song.gradient} flex items-center justify-center`}>
        <span className="text-sm font-bold text-white">{song.initials}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{song.title}</p>
        <p className="truncate text-xs text-muted-foreground">{song.artist}</p>
      </div>
      <Music className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
    </div>
  );
}

function VerticalColumn({ songs, duration, direction }: { songs: typeof SONGS_A; duration: string; direction: "up" | "down" }) {
  const doubled = [...songs, ...songs];
  return (
    <div className="relative h-full w-[180px] overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-16 bg-gradient-to-b from-background to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t from-background to-transparent" />
      <div
        className={direction === "up" ? "animate-scroll-up" : "animate-scroll-down"}
        style={{ animationDuration: duration }}
        aria-hidden="true"
      >
        <div className="flex flex-col gap-3 py-2">
          {doubled.map((song, i) => (
            <SongCard key={`${song.initials}-${i}`} song={song} />
          ))}
        </div>
      </div>
    </div>
  );
}

function HorizontalStrip({ songs }: { songs: typeof ALL_SONGS }) {
  const doubled = [...songs, ...songs];
  return (
    <div className="relative w-full overflow-hidden motion-reduce:overflow-x-auto">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-background to-transparent motion-reduce:hidden" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-background to-transparent motion-reduce:hidden" />
      <div className="animate-scroll-left flex gap-3 py-2" style={{ animationDuration: "25s" }} aria-hidden="true">
        {doubled.map((song, i) => (
          <div key={`h-${song.initials}-${i}`} className="w-[220px] shrink-0 sm:w-[240px]">
            <SongCard song={song} />
          </div>
        ))}
      </div>
    </div>
  );
}

function LoginForm() {
  const { redirectUrl } = Route.useRouteContext();
  const _router = useRouter();
  const queryClient = useQueryClient();

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isLoading) return;

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    if (!email || !password) return;

    setIsLoading(true);
    setErrorMessage("");

    authClient.signIn.email(
      {
        email,
        password,
        callbackURL: redirectUrl,
      },
      {
        onError: (ctx) => {
          const msg = ctx.error.message;
          // better-auth returns vague errors — make them user-friendly
          if (msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('credential') || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('not found')) {
            setErrorMessage('Invalid email or password. Please try again.');
          } else {
            setErrorMessage(msg || 'Something went wrong. Please try again.');
          }
          setIsLoading(false);
        },
        onSuccess: async () => {
          queryClient.removeQueries({ queryKey: ["user"] });
          window.location.href = redirectUrl;
        },
      },
    );
  };

  return (
    <div className="bg-background text-foreground">
      <div className="mx-auto flex min-h-svh max-w-[1100px] items-center px-6">
        {/* Carousel — desktop only */}
        <div className="hidden h-[600px] w-1/2 items-center justify-center md:flex" aria-hidden="true">
          <div className="flex gap-3">
            <VerticalColumn songs={SONGS_A} duration="25s" direction="up" />
            <VerticalColumn songs={SONGS_B} duration="30s" direction="down" />
          </div>
        </div>

        {/* Form side */}
        <div className="flex w-full flex-col md:w-1/2 md:pl-12">
          {/* Horizontal carousel — mobile/tablet only */}
          <div className="mb-8 md:hidden" aria-hidden="true">
            <HorizontalStrip songs={ALL_SONGS} />
          </div>

          <div className="mx-auto w-full max-w-[400px] md:mx-0">
            {/* Brand */}
            <div className="mb-8">
              <div className="mb-4 inline-flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2">
                <Disc3 className="h-6 w-6 text-primary" />
                <span className="text-2xl font-bold tracking-tight">AIDJ</span>
              </div>
              <h1 className="text-xl font-bold tracking-tight">Welcome back</h1>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <Headphones className="h-3.5 w-3.5" />
                Your AI DJ is building your perfect queue
              </p>
            </div>

            {/* Form */}
            <form method="post" onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="hello@example.com"
                  readOnly={isLoading}
                  required
                  className="min-h-[44px]"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    to="/forgot-password"
                    className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter password here"
                    readOnly={isLoading}
                    required
                    className="min-h-[44px] pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {errorMessage && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/30 px-3 py-2.5">
                  <p className="text-sm font-medium text-red-500 dark:text-red-400">{errorMessage}</p>
                </div>
              )}

              <Button type="submit" className="w-full min-h-[44px]" size="lg" disabled={isLoading}>
                {isLoading && <LoaderCircle className="animate-spin" />}
                {isLoading ? "Logging in..." : "Start Listening"}
              </Button>
            </form>

            {/* Divider */}
            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-background px-3 text-sm text-muted-foreground">Or continue with</span>
              </div>
            </div>

            {/* OAuth */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="min-h-[44px]"
                type="button"
                disabled={isLoading}
                onClick={() =>
                  authClient.signIn.social(
                    {
                      provider: "github",
                      callbackURL: redirectUrl,
                    },
                    {
                      onRequest: () => {
                        setIsLoading(true);
                        setErrorMessage("");
                      },
                      onError: (ctx) => {
                        setIsLoading(false);
                        setErrorMessage(ctx.error.message);
                      },
                    },
                  )
                }
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                GitHub
              </Button>
              <Button
                variant="outline"
                className="min-h-[44px]"
                type="button"
                disabled={true} // TODO: Enable when GOOGLE_CLIENT_ID is configured
                onClick={() =>
                  authClient.signIn.social(
                    {
                      provider: "google",
                      callbackURL: redirectUrl,
                    },
                    {
                      onRequest: () => {
                        setIsLoading(true);
                        setErrorMessage("");
                      },
                      onError: (ctx) => {
                        setIsLoading(false);
                        setErrorMessage(ctx.error.message);
                      },
                    },
                  )
                }
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                </svg>
                Google
              </Button>
            </div>

            {/* Sign up link */}
            <p className="mt-6 text-center text-sm text-muted-foreground md:text-left">
              Don&apos;t have an account?{" "}
              <Link to="/signup" className="font-medium text-primary underline underline-offset-4 hover:text-primary/80 transition-colors">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
