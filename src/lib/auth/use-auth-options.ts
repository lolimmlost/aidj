import { useQuery } from "@tanstack/react-query";
import type { PublicAuthOptions } from "./auth-options";

const NONE: PublicAuthOptions = { github: false, google: false, emailOtp: false };

/**
 * Sign-in options the server offers (GET /api/auth-options). Until it answers,
 * everything optional is treated as unavailable, so no dead button ever shows.
 */
export function useAuthOptions(): PublicAuthOptions {
  const { data } = useQuery({
    queryKey: ["auth-options"],
    queryFn: async (): Promise<PublicAuthOptions> => {
      const res = await fetch("/api/auth-options");
      if (!res.ok) return NONE;
      const json = (await res.json()) as Partial<PublicAuthOptions>;
      return { github: !!json.github, google: !!json.google, emailOtp: !!json.emailOtp };
    },
    staleTime: 5 * 60 * 1000,
  });
  return data ?? NONE;
}
