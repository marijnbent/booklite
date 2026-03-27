import React from "react";
import type { UseMutationResult } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, LogIn, Pencil, Trash2 } from "lucide-react";

export interface UserItem {
  id: number;
  email: string | null;
  username: string;
  role: "OWNER" | "MEMBER";
  disabledAt: string | null;
  createdAt: string;
}

const getEmailLabel = (emailValue: string | null): string => emailValue ?? "No email";

// ---------------------------------------------------------------------------
// Edit User Dialog
// ---------------------------------------------------------------------------

export const EditUserDialog: React.FC<{
  editTarget: UserItem | null;
  editEmail: string;
  editUsername: string;
  setEditEmail: (value: string) => void;
  setEditUsername: (value: string) => void;
  updateUserDetails: UseMutationResult<UserItem, Error, { id: number; payload: Record<string, unknown> }>;
  closeEditDialog: () => void;
}> = ({ editTarget, editEmail, editUsername, setEditEmail, setEditUsername, updateUserDetails, closeEditDialog }) => (
  <Dialog
    open={editTarget !== null}
    onOpenChange={(open) => {
      if (!open && !updateUserDetails.isPending) {
        closeEditDialog();
      }
    }}
  >
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Edit user</DialogTitle>
        <DialogDescription>
          Update the username or email address for this account.
        </DialogDescription>
      </DialogHeader>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!editTarget) return;
          const normalizedEmail =
            editEmail.trim().length > 0 ? editEmail.trim().toLowerCase() : null;
          const normalizedUsername = editUsername.trim();
          updateUserDetails.mutate({
            id: editTarget.id,
            payload: {
              email: normalizedEmail,
              username: normalizedUsername,
            },
          });
        }}
        className="space-y-4"
        autoComplete="off"
        data-form-type="other"
        data-lpignore="true"
        data-1p-ignore="true"
        data-bwignore="true"
      >
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="edit-user-email" className="text-xs text-muted-foreground">
              Email
            </Label>
            <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
              Optional
            </Badge>
          </div>
          <Input
            id="edit-user-email"
            type="email"
            name="admin-edit-user-email"
            placeholder="user@example.com"
            value={editEmail}
            onChange={(event) => {
              setEditEmail(event.target.value);
              if (updateUserDetails.error) updateUserDetails.reset();
            }}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            data-form-type="other"
            data-lpignore="true"
            data-1p-ignore="true"
            data-bwignore="true"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="edit-user-username" className="text-xs text-muted-foreground">
            Username
          </Label>
          <Input
            id="edit-user-username"
            type="text"
            name="admin-edit-user-username"
            placeholder="username"
            value={editUsername}
            onChange={(event) => {
              setEditUsername(event.target.value);
              if (updateUserDetails.error) updateUserDetails.reset();
            }}
            required
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            data-form-type="other"
            data-lpignore="true"
            data-1p-ignore="true"
            data-bwignore="true"
          />
        </div>
        {updateUserDetails.error instanceof Error && editTarget && (
          <p className="text-sm text-destructive">{updateUserDetails.error.message}</p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={closeEditDialog}
            disabled={updateUserDetails.isPending}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!editTarget || updateUserDetails.isPending}>
            {updateUserDetails.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Pencil className="size-4" />
                Save changes
              </>
            )}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
);

// ---------------------------------------------------------------------------
// Delete User Dialog
// ---------------------------------------------------------------------------

export const DeleteUserDialog: React.FC<{
  deleteTarget: UserItem | null;
  setDeleteTarget: (user: UserItem | null) => void;
  deleteUser: UseMutationResult<{ ok: true }, Error, number>;
}> = ({ deleteTarget, setDeleteTarget, deleteUser }) => (
  <Dialog
    open={deleteTarget !== null}
    onOpenChange={(open) => {
      if (!open && !deleteUser.isPending) setDeleteTarget(null);
    }}
  >
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Delete disabled user</DialogTitle>
        <DialogDescription>
          This permanently removes the account. Only disabled users without owned books can
          be deleted.
        </DialogDescription>
      </DialogHeader>
      {deleteTarget && (
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-sm font-semibold">{deleteTarget.username}</p>
          <p className="text-xs text-muted-foreground">{getEmailLabel(deleteTarget.email)}</p>
        </div>
      )}
      {deleteUser.error instanceof Error && (
        <p className="text-sm text-destructive">{deleteUser.error.message}</p>
      )}
      <DialogFooter>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setDeleteTarget(null)}
          disabled={deleteUser.isPending}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={!deleteTarget || deleteUser.isPending}
          onClick={() => {
            if (!deleteTarget) return;
            deleteUser.mutate(deleteTarget.id);
          }}
        >
          {deleteUser.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Deleting...
            </>
          ) : (
            <>
              <Trash2 className="size-4" />
              Delete user
            </>
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

// ---------------------------------------------------------------------------
// Impersonation Dialog
// ---------------------------------------------------------------------------

export const ImpersonationDialog: React.FC<{
  impersonationTarget: UserItem | null;
  setImpersonationTarget: (user: UserItem | null) => void;
  impersonateUser: UseMutationResult<void, Error, UserItem>;
}> = ({ impersonationTarget, setImpersonationTarget, impersonateUser }) => (
  <Dialog
    open={impersonationTarget !== null}
    onOpenChange={(open) => {
      if (!open && !impersonateUser.isPending) setImpersonationTarget(null);
    }}
  >
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>Impersonate {impersonationTarget?.username}</DialogTitle>
        <DialogDescription>
          BookLite will switch this browser into that member account and keep your admin
          session parked behind a restore overlay so you can come back when you are done.
        </DialogDescription>
      </DialogHeader>
      {impersonationTarget && (
        <div className="rounded-xl border border-border bg-muted/30 p-4">
          <p className="text-sm font-semibold">{impersonationTarget.username}</p>
          <p className="text-xs text-muted-foreground">{getEmailLabel(impersonationTarget.email)}</p>
        </div>
      )}
      {impersonateUser.error instanceof Error && (
        <p className="text-sm text-destructive">{impersonateUser.error.message}</p>
      )}
      <DialogFooter>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setImpersonationTarget(null)}
          disabled={impersonateUser.isPending}
        >
          Cancel
        </Button>
        <Button
          type="button"
          disabled={!impersonationTarget || impersonateUser.isPending}
          onClick={() => {
            if (!impersonationTarget) return;
            impersonateUser.mutate(impersonationTarget);
          }}
        >
          {impersonateUser.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Switching...
            </>
          ) : (
            <>
              <LogIn className="size-4" />
              Continue as user
            </>
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
