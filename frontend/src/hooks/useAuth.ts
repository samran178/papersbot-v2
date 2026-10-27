import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { Role, User } from "@/lib/types";

type MeResponse = { user: User | null };

export const ME_KEY = ["me"] as const;

export const useMe = () =>
  useQuery({
    queryKey: ME_KEY,
    queryFn: () => api.get<MeResponse>("/auth/me"),
    staleTime: 5 * 60_000,
    select: (data) => data.user,
  });

export type RegisterInput = {
  username: string;
  email: string;
  full_name: string;
  password: string;
  role: Exclude<Role, "admin">;
  roll_number?: string;
  department?: string;
};

export const useAuthActions = () => {
  const queryClient = useQueryClient();
  const setUser = (data: MeResponse) => {
    queryClient.clear();
    queryClient.setQueryData(ME_KEY, data);
  };

  const login = useMutation({
    mutationFn: (input: { username: string; password: string }) => api.post<MeResponse>("/auth/login", input),
    onSuccess: setUser,
  });
  const register = useMutation({
    mutationFn: (input: RegisterInput) => api.post<MeResponse>("/auth/register", input),
    onSuccess: setUser,
  });
  const logout = useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSettled: () => setUser({ user: null }),
  });
  return { login, register, logout };
};

export const homePathFor = (user: User) => {
  if (user.role === "admin") return "/admin";
  if (user.role === "teacher") return user.approval_status === "approved" ? "/teacher" : "/pending";
  return "/student";
};
