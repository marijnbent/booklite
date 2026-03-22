import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Check, Loader2, Plus, Search, Users } from "lucide-react";

interface SharePeer {
  id: number;
  username: string;
}

interface BookShare {
  id: number;
  recipientUserId: number;
  username: string;
  sharedAt: string;
}

interface ShareMenuRow extends SharePeer {
  isShared: boolean;
  shareId: number | null;
}

type ShareMenuItemLikeProps = {
  children?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  onSelect?: (event: Event) => void;
};

function getUserInitials(username: string): string {
  return username
    .trim()
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2) || "?";
}

function useBookShareController(
  bookId: number,
  onShareCountChange: (bookId: number, delta: number) => void,
) {
  const queryClient = useQueryClient();

  const peersQuery = useQuery({
    queryKey: ["users", "peers"],
    queryFn: () => apiFetch<SharePeer[]>("/api/v1/users/peers"),
    staleTime: 60_000,
  });

  const sharesQuery = useQuery({
    queryKey: ["book-shares", bookId],
    queryFn: () => apiFetch<BookShare[]>(`/api/v1/books/${bookId}/shares`),
  });

  const rows = useMemo<ShareMenuRow[]>(() => {
    const activeShares = new Map((sharesQuery.data ?? []).map((share) => [share.recipientUserId, share]));

    return (peersQuery.data ?? [])
      .map((peer) => {
        const activeShare = activeShares.get(peer.id);
        return {
          ...peer,
          isShared: Boolean(activeShare),
          shareId: activeShare?.id ?? null,
        };
      })
      .sort((a, b) => {
        if (a.isShared !== b.isShared) return a.isShared ? -1 : 1;
        return a.username.localeCompare(b.username, undefined, { sensitivity: "base" });
      });
  }, [peersQuery.data, sharesQuery.data]);

  const toggleShareMutation = useMutation({
    mutationFn: async (peer: ShareMenuRow) => {
      if (peer.isShared && peer.shareId) {
        await apiFetch(`/api/v1/books/${bookId}/shares/${peer.shareId}`, { method: "DELETE" });
        return { action: "revoke" as const, peer };
      }

      const share = await apiFetch<BookShare>(`/api/v1/books/${bookId}/shares`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipientUserId: peer.id }),
      });
      return { action: "share" as const, peer, share };
    },
    onSuccess: (result) => {
      queryClient.setQueryData<BookShare[]>(["book-shares", bookId], (current = []) => {
        if (result.action === "revoke") {
          return current.filter((share) => share.id !== result.peer.shareId);
        }

        const next = current.filter((share) => share.recipientUserId !== result.share.recipientUserId);
        next.push(result.share);
        return next.sort((a, b) => a.username.localeCompare(b.username, undefined, { sensitivity: "base" }));
      });

      onShareCountChange(bookId, result.action === "share" ? 1 : -1);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["book-shares", bookId] });
    },
  });

  return {
    rows,
    isLoading: peersQuery.isLoading || sharesQuery.isLoading,
    pendingPeerId: toggleShareMutation.isPending ? toggleShareMutation.variables?.id ?? null : null,
    togglePeer: toggleShareMutation.mutate,
  };
}

const SharePeerMenuItems: React.FC<{
  rows: ShareMenuRow[];
  isLoading: boolean;
  pendingPeerId: number | null;
  onPeerSelect: (peer: ShareMenuRow) => (event: Event) => void;
  Item: React.ComponentType<ShareMenuItemLikeProps>;
}> = ({ rows, isLoading, pendingPeerId, onPeerSelect, Item }) => {
  if (isLoading) {
    return (
      <Item disabled className="gap-2 text-xs opacity-70">
        <Loader2 className="size-3.5 animate-spin" />
        Loading people...
      </Item>
    );
  }

  if (rows.length === 0) {
    return (
      <Item disabled className="gap-2 text-xs opacity-70">
        <Users className="size-3.5" />
        No users available
      </Item>
    );
  }

  return (
    <>
      {rows.map((peer) => {
        const isPending = pendingPeerId === peer.id;

        return (
          <Item
            key={peer.id}
            onSelect={onPeerSelect(peer)}
            className={cn("gap-2 text-xs", peer.isShared && "bg-accent")}
          >
            <span className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-muted text-[10px] font-medium">
              {getUserInitials(peer.username)}
            </span>
            <span className="truncate">{peer.username}</span>
            {isPending ? (
              <Loader2 className="ml-auto size-3 animate-spin" />
            ) : peer.isShared ? (
              <Check className="ml-auto size-3 text-primary" />
            ) : (
              <Plus className="ml-auto size-3 text-muted-foreground/50" />
            )}
          </Item>
        );
      })}
    </>
  );
};

export const ShareBookMenuSub: React.FC<{
  bookId: number;
  onMenuAction: () => void;
  onShareCountChange: (bookId: number, delta: number) => void;
  MenuItem: React.ComponentType<ShareMenuItemLikeProps>;
  MenuSub: React.ComponentType<{ children: React.ReactNode }>;
  MenuSubTrigger: React.ComponentType<{ children: React.ReactNode; className?: string }>;
  MenuSubContent: React.ComponentType<{ children: React.ReactNode; className?: string }>;
}> = ({
  bookId,
  onMenuAction,
  onShareCountChange,
  MenuItem,
  MenuSub,
  MenuSubTrigger,
  MenuSubContent,
}) => {
  const { rows, isLoading, pendingPeerId, togglePeer } = useBookShareController(bookId, onShareCountChange);

  const handlePeerSelect = useCallback(
    (peer: ShareMenuRow) =>
      (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        onMenuAction();
        togglePeer(peer);
      },
    [onMenuAction, togglePeer],
  );

  return (
    <MenuSub>
      <MenuSubTrigger className="gap-2 text-xs">
        <Users className="size-3.5" />
        Share
      </MenuSubTrigger>
      <MenuSubContent className="w-56">
        <SharePeerMenuItems
          rows={rows}
          isLoading={isLoading}
          pendingPeerId={pendingPeerId}
          onPeerSelect={handlePeerSelect}
          Item={MenuItem}
        />
      </MenuSubContent>
    </MenuSub>
  );
};

export const ShareBookDropdown: React.FC<{
  bookId: number;
  onShareCountChange: (bookId: number, delta: number) => void;
  className?: string;
}> = ({ bookId, onShareCountChange, className }) => {
  const { rows, isLoading, pendingPeerId, togglePeer } = useBookShareController(bookId, onShareCountChange);

  const handlePeerSelect = useCallback(
    (peer: ShareMenuRow) =>
      (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        togglePeer(peer);
      },
    [togglePeer],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className={cn("h-9 justify-center gap-2", className)}>
          <Users className="size-3.5" />
          Share
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-56">
        <DropdownMenuLabel className="text-xs">Share with</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <SharePeerMenuItems
          rows={rows}
          isLoading={isLoading}
          pendingPeerId={pendingPeerId}
          onPeerSelect={handlePeerSelect}
          Item={DropdownMenuItem}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export const ShareSelectedBooksDialog: React.FC<{
  bookIds: number[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}> = ({ bookIds, open, onOpenChange }) => {
  const [search, setSearch] = useState("");
  const [sharedRecipientIds, setSharedRecipientIds] = useState<Set<number>>(new Set());
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!open) {
      setSearch("");
      setSharedRecipientIds(new Set());
    }
  }, [open]);

  const peersQuery = useQuery({
    queryKey: ["users", "peers"],
    queryFn: () => apiFetch<SharePeer[]>("/api/v1/users/peers"),
    enabled: open,
  });

  const shareMutation = useMutation({
    mutationFn: async (recipientUserId: number) => {
      await Promise.all(
        bookIds.map((bookId) =>
          apiFetch(`/api/v1/books/${bookId}/shares`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ recipientUserId }),
          })
        )
      );
      return recipientUserId;
    },
    onSuccess: (recipientUserId) => {
      setSharedRecipientIds((prev) => new Set(prev).add(recipientUserId));
      void queryClient.invalidateQueries({ queryKey: ["books"] });
      void queryClient.invalidateQueries({ queryKey: ["collection-books"] });
      for (const bookId of bookIds) {
        void queryClient.invalidateQueries({ queryKey: ["book-shares", bookId] });
      }
    },
  });

  const rows = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return (peersQuery.data ?? []).filter((peer) =>
      normalizedSearch.length === 0 ? true : peer.username.toLowerCase().includes(normalizedSearch)
    );
  }, [peersQuery.data, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg rounded-xl">
        <DialogHeader>
          <DialogTitle>Share {bookIds.length} {bookIds.length === 1 ? "book" : "books"}</DialogTitle>
          <DialogDescription>Choose who should get this selection in their library.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search users..."
              className="pl-9"
              autoFocus
            />
          </div>

          <div className="max-h-[360px] overflow-y-auto rounded-lg border border-border/60">
            {peersQuery.isLoading && (
              <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading people...
              </div>
            )}

            {!peersQuery.isLoading && rows.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                {search ? "No matching users found." : "No other users are available right now."}
              </div>
            )}

            {!peersQuery.isLoading && rows.length > 0 && (
              <div className="divide-y divide-border/60">
                {rows.map((peer) => {
                  const isSharing = shareMutation.isPending && shareMutation.variables === peer.id;
                  const alreadyShared = sharedRecipientIds.has(peer.id);

                  return (
                    <div key={peer.id} className="flex items-center gap-3 px-4 py-3">
                      <Avatar className="size-8">
                        <AvatarFallback className="text-xs">
                          {getUserInitials(peer.username)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{peer.username}</p>
                      </div>
                      {alreadyShared ? (
                        <span className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-secondary px-2 py-1 text-[11px] font-medium text-secondary-foreground">
                          <Check className="size-3" />
                          Shared
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          className="gap-1.5"
                          disabled={isSharing}
                          onClick={() => shareMutation.mutate(peer.id)}
                        >
                          {isSharing ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Users className="size-3.5" />
                          )}
                          Share
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
