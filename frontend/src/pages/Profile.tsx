import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/ui/feedback";
import { Badge, Button, Card, CardHeader, Field, Input } from "@/components/ui/primitives";
import { ME_KEY, useMe } from "@/hooks/useAuth";
import { api, errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { User } from "@/lib/types";

const Profile = () => {
  const { data: user } = useMe();
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState({
    full_name: user?.full_name ?? "",
    email: user?.email ?? "",
    roll_number: user?.roll_number ?? "",
    department: user?.department ?? "",
  });
  const [passwords, setPasswords] = useState({ current_password: "", new_password: "", confirm: "" });

  const saveProfile = useMutation({
    mutationFn: () => api.patch<{ user: User }>("/auth/me", profile),
    onSuccess: (data) => {
      queryClient.setQueryData(ME_KEY, data);
      toast.success("Profile updated");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const changePassword = useMutation({
    mutationFn: () => api.post("/auth/change-password", { current_password: passwords.current_password, new_password: passwords.new_password }),
    onSuccess: () => {
      setPasswords({ current_password: "", new_password: "", confirm: "" });
      toast.success("Password changed");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (!user) return null;

  const submitProfile = (event: FormEvent) => {
    event.preventDefault();
    saveProfile.mutate();
  };
  const submitPassword = (event: FormEvent) => {
    event.preventDefault();
    if (passwords.new_password !== passwords.confirm) {
      toast.error("New passwords don't match.");
      return;
    }
    changePassword.mutate();
  };

  return (
    <>
      <PageHeader
        title="Profile"
        description={
          <span className="flex flex-wrap items-center gap-2">
            @{user.username} <Badge className="capitalize">{user.role}</Badge> · joined {formatDate(user.date_joined)}
          </span>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <Card>
          <CardHeader title="Your details" />
          <form onSubmit={submitProfile} className="space-y-4 p-4 sm:p-5">
            <Field label="Full name">{(id) => <Input id={id} value={profile.full_name} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} required />}</Field>
            <Field label="Email">{(id) => <Input id={id} type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} required />}</Field>
            {user.role === "student" && (
              <Field label="Roll number">{(id) => <Input id={id} value={profile.roll_number} onChange={(e) => setProfile({ ...profile, roll_number: e.target.value })} />}</Field>
            )}
            {user.role === "teacher" && (
              <Field label="Department">{(id) => <Input id={id} value={profile.department} onChange={(e) => setProfile({ ...profile, department: e.target.value })} />}</Field>
            )}
            <Button type="submit" loading={saveProfile.isPending}>
              Save details
            </Button>
          </form>
        </Card>
        <Card>
          <CardHeader title="Change password" />
          <form onSubmit={submitPassword} className="space-y-4 p-4 sm:p-5">
            <Field label="Current password">
              {(id) => <Input id={id} type="password" autoComplete="current-password" value={passwords.current_password} onChange={(e) => setPasswords({ ...passwords, current_password: e.target.value })} required />}
            </Field>
            <Field label="New password" hint="At least 8 characters, not just numbers.">
              {(id) => <Input id={id} type="password" autoComplete="new-password" value={passwords.new_password} onChange={(e) => setPasswords({ ...passwords, new_password: e.target.value })} required />}
            </Field>
            <Field label="Confirm new password">
              {(id) => <Input id={id} type="password" autoComplete="new-password" value={passwords.confirm} onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })} required />}
            </Field>
            <Button type="submit" loading={changePassword.isPending}>
              Change password
            </Button>
          </form>
        </Card>
      </div>
    </>
  );
};

export default Profile;
