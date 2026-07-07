"use client";

// Users (DESIGN.md §5.4): list with role filter, create via modal,
// disable/enable behind a confirm modal (it locks them out on their next
// request — worth a deliberate click).

import { Plus, UserX, UserCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Table, THead, Th, Tr, Td } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { api, type Clinic } from "./../lib";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "va" | "doctor" | "operator";
  active: boolean;
  clinicId: string | null;
  clinic: { name: string } | null;
};

const ROLES = ["all", "va", "doctor", "operator"] as const;

export default function UsersPage() {
  const toast = useToast();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [filter, setFilter] = useState<(typeof ROLES)[number]>("all");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmUser, setConfirmUser] = useState<UserRow | null>(null);

  const refresh = useCallback(async () => {
    const [u, c] = await Promise.all([
      api("/api/operator/users"),
      api("/api/operator/clinics"),
    ]);
    setUsers(u as UserRow[]);
    setClinics(c as Clinic[]);
  }, []);

  useEffect(() => {
    refresh().catch((e) => toast("error", (e as Error).message));
  }, [refresh, toast]);

  const create = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api("/api/operator/users", {
        method: "POST",
        body: JSON.stringify({
          name: f.get("name"),
          email: f.get("email"),
          password: f.get("password"),
          role: f.get("role"),
          clinicId: f.get("role") === "operator" ? undefined : f.get("clinicId") || undefined,
        }),
      });
      setCreating(false);
      toast("success", "User created.");
      refresh();
    } catch (err) {
      toast("error", (err as Error).message);
    }
    setBusy(false);
  };

  const toggleActive = async (u: UserRow) => {
    setBusy(true);
    try {
      await api(`/api/operator/users/${u.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !u.active }),
      });
      toast("success", u.active ? `${u.name} disabled.` : `${u.name} enabled.`);
      setConfirmUser(null);
      refresh();
    } catch (err) {
      toast("error", (err as Error).message);
    }
    setBusy(false);
  };

  const shown = users?.filter((u) => filter === "all" || u.role === filter);

  return (
    <>
      <Card>
        <CardHeader
          title="Users"
          subtitle="Across all clinics. Disabling locks the account out on its next request."
          right={
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              Add user
            </Button>
          }
        />
        <CardBody>
          <div className="flex gap-1.5 mb-3">
            {ROLES.map((r) => (
              <button
                key={r}
                onClick={() => setFilter(r)}
                className={`h-7 px-2.5 rounded-full text-caption font-medium capitalize
                  transition-colors duration-120
                  ${filter === r ? "bg-accent-soft text-accent" : "text-ink-3 hover:bg-surface-2"}`}
              >
                {r}
              </button>
            ))}
          </div>
          {!shown ? (
            <SkeletonRows />
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Role</Th>
                  <Th>Clinic</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </THead>
              <tbody>
                {shown.map((u) => (
                  <Tr key={u.id} className={u.active ? "" : "opacity-50"}>
                    <Td className="font-medium">{u.name}</Td>
                    <Td className="text-ink-2">{u.email}</Td>
                    <Td><Badge tone={u.role === "operator" ? "violet" : u.role === "doctor" ? "accent" : "neutral"}>{u.role}</Badge></Td>
                    <Td className="text-ink-2">{u.clinic?.name ?? "—"}</Td>
                    <Td>
                      <Badge tone={u.active ? "success" : "danger"}>
                        {u.active ? "active" : "disabled"}
                      </Badge>
                    </Td>
                    <Td className="text-right">
                      <Button
                        size="sm"
                        icon={u.active ? <UserX className="size-3.5" /> : <UserCheck className="size-3.5" />}
                        onClick={() => setConfirmUser(u)}
                      >
                        {u.active ? "Disable" : "Enable"}
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* create modal */}
      <Modal open={creating} onClose={() => setCreating(false)} title="Add a user">
        <form onSubmit={create} className="grid gap-3">
          <Input name="name" label="Name" required />
          <Input name="email" label="Email" type="email" required />
          <Input name="password" label="Password" minLength={10} placeholder="10+ characters" required />
          <div className="grid grid-cols-2 gap-3">
            <Select name="role" label="Role" required defaultValue="va">
              <option value="va">va</option>
              <option value="doctor">doctor</option>
              <option value="operator">operator</option>
            </Select>
            <Select name="clinicId" label="Clinic (va / doctor)">
              <option value="">—</option>
              {clinics.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" onClick={() => setCreating(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={busy}>Create user</Button>
          </div>
        </form>
      </Modal>

      {/* disable/enable confirm */}
      <Modal
        open={!!confirmUser}
        onClose={() => setConfirmUser(null)}
        title={confirmUser?.active ? "Disable this user?" : "Enable this user?"}
      >
        {confirmUser && (
          <>
            <p className="text-body text-ink-2 mb-4">
              {confirmUser.active ? (
                <>
                  <b className="text-ink">{confirmUser.name}</b> ({confirmUser.email}) will be
                  locked out on their next request. You can re-enable them any time.
                </>
              ) : (
                <>
                  <b className="text-ink">{confirmUser.name}</b> ({confirmUser.email}) will be able
                  to sign in again.
                </>
              )}
            </p>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setConfirmUser(null)}>Cancel</Button>
              <Button
                variant={confirmUser.active ? "danger" : "primary"}
                loading={busy}
                onClick={() => toggleActive(confirmUser)}
              >
                {confirmUser.active ? "Disable" : "Enable"}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
