import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ThemeToggle } from "~/components/theme-toggle";
import { Button } from "~/components/ui/button";
import authClient from "~/lib/auth/auth-client";
import { authQueryOptions } from "~/lib/auth/queries";

export const Route = createFileRoute("/")({
  component: Home,
  loader: ({ context }) => {
    return { user: context.user };
  },
});

function Home() {
  const { user } = Route.useLoaderData();
  const queryClient = useQueryClient();
  const router = useRouter();

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-10 p-2">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-3xl font-bold sm:text-4xl">React TanStarter</h1>
        <div className="text-foreground/80 flex items-center gap-2 text-sm max-sm:flex-col">
          This is an unprotected page:
          <pre className="bg-card text-card-foreground rounded-md border p-1">
            routes/index.tsx
          </pre>
        </div>
      </div>

      {user ? (
        <div className="flex flex-col items-center gap-2">
          <p>Welcome back, {user.name}!</p>
          <Button type="button" asChild className="mb-2 w-fit" size="lg">
            <Link to="/dashboard">Go to Dashboard</Link>
          </Button>
          <div className="text-center text-xs sm:text-sm">
            Session user:
            <pre className="max-w-screen overflow-x-auto px-2 text-start">
              {JSON.stringify(user, null, 2)}
            </pre>
          </div>

          <Button
            onClick={async () => {
              await authClient.signOut({
                fetchOptions: {
                  onResponse: async () => {
                    // manually set to null to avoid unnecessary refetching
                    queryClient.setQueryData(authQueryOptions().queryKey, null);
                    await router.invalidate();
                  },
                },
              });
            }}
            type="button"
            className="w-fit"
            variant="destructive"
            size="lg"
          >
            Sign out
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <p>You are not signed in.</p>
          <Button type="button" asChild className="w-fit" size="lg">
            <Link to="/login">Log in</Link>
          </Button>
        </div>
      )}

      <div className="flex flex-col items-center gap-2">
        <p className="text-foreground/80 max-sm:text-xs">
          A minimal starter template for{" "}
          <a
            className="text-foreground group"
            href="https://tanstack.com/start/latest"
            target="_blank"
            rel="noreferrer noopener"
          >
            🏝️ <span className="group-hover:underline">TanStack Start</span>
          </a>
          .
        </p>
        <div className="flex items-center gap-3">
          <a
            className="text-foreground/80 hover:text-foreground underline max-sm:text-sm"
            href="https://github.com/dotnize/react-tanstarter"
            target="_blank"
            rel="noreferrer noopener"
          >
            <svg
              role="img"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              className="mr-1.5 inline size-4"
              fill="currentColor"
            >
              <title>GitHub</title>
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
            </svg>
            dotnize/react-tanstarter
          </a>

          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
